"""Download only the 12 explicitly selected SkyFinder archives, respecting robots and delay.
CC BY 4.0; retain max-512px derivatives, never ZIPs/full-resolution originals on disk.
Run from web/: python3 scripts/prepare-real-photos.py. Pillow is required.
"""
from pathlib import Path
from io import BytesIO
import hashlib, json, re, time, urllib.request, urllib.error, urllib.robotparser, zipfile
from PIL import Image, ImageStat, ImageOps

ROOT = Path(__file__).resolve().parents[1] / 'eval/real-photos'
PLAN = json.loads((ROOT / 'protocol.json').read_text())
BASE = 'https://zenodo.org'
PAGE = BASE + '/records/5884485'
UA = 'PairSight-Research/1.0 (bounded image comparison evaluation)'
# Checksums published on the record. No recursive discovery or archive extraction.
MD5 = {'858':'c69bea20bb8791161f44c426e23860d3', '1093':'a920656e16582d2c5707242cfbd42471',
       '3297':'3a2878a1cf668f86a4655fa4c91ae519', '3888':'1373f5263dfd89c360d883684f840f78',
       '4232':'9d8c1d46275d2064f281ba5e01e257b4', '4795':'f95b599f27a871ace482ea6d3d0bc81d',
       '4801':'dd6df0e0550032c25292df71758ce747', '5021':'5a5abe3fee90f8035f0eb1ced832c810',
       '8438':'f765203054eeae2bb7c804fb09baacb6', '19106':'ad68c4b420236000e456949628b83599',
       '21444':'2bf7f86e35862081072d91206075788a', '9730':'c934717cdfcfcae45ded83d9cfc8ddb0'}
last_request = 0.0
request_delay = 10

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Unexpected redirect; inspect manually instead of bypassing')

opener = urllib.request.build_opener(NoRedirect)
def raw_get(url, cap):
    global last_request
    time.sleep(max(0, request_delay - (time.monotonic() - last_request)))
    last_request = time.monotonic()
    with opener.open(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as response:
        data = response.read(cap + 1)
    if len(data) > cap:
        raise ValueError('Download exceeded the declared bound')
    return data

robots = raw_get(BASE + '/robots.txt', 100_000).decode()
rp = urllib.robotparser.RobotFileParser()
rp.parse(robots.splitlines())
request_delay = max(10, rp.crawl_delay(UA) or 0)
def get(url, cap):
    if not url.startswith(BASE + '/') or not rp.can_fetch(UA, url):
        raise ValueError('robots or origin policy denied: ' + url)
    return raw_get(url, cap)

page = get(PAGE, 2_000_000).decode()
if 'https://creativecommons.org/licenses/by/4.0/legalcode' not in page or 'license-cc-by-4.0' not in page:
    raise ValueError('The dataset license changed or cannot be confirmed; stop for review')
sha = lambda b: hashlib.sha256(b).hexdigest()
manifest_path = ROOT / 'sources.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
    'dataset': 'SkyFinder v1', 'sourcePage': PAGE, 'doi': '10.5281/zenodo.5884485',
    'authors': ['Nathan Jacobs', 'Radu Paul Mihail'],
    'citation': 'Mihail RP, Workman S, Bessinger Z, Jacobs N (2016). Sky Segmentation in the Wild: An Empirical Study. WACV. DOI:10.1109/WACV.2016.7477637.',
    'license': 'CC-BY-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/legalcode',
    'licenseCheckedAt': PLAN['registeredAt'], 'licenseEvidence': 'Creative Commons Attribution 4.0 International',
    'changes': 'Decoded, EXIF orientation applied, RGB converted, aspect-preserving resize to max 512px, lossless PNG; EXIF stripped. Controlled evaluation edits described separately.',
    'protocolSha256': sha((ROOT / 'protocol.json').read_bytes()), 'images': [],
}
(ROOT / 'images').mkdir(exist_ok=True)
for camera in sorted(MD5, key=int):
    retained = [x for x in manifest['images'] if x['camera'] == camera]
    if len(retained) == 3:
        for x in retained:
            assert sha((ROOT / x['file']).read_bytes()) == x['sha256']
        print('Already verified', camera, flush=True)
        continue
    url = PAGE + '/files/' + camera + '.zip?download=1'
    data = get(url, 60_000_000)
    if hashlib.md5(data).hexdigest() != MD5[camera]:
        raise ValueError('Archive checksum mismatch: ' + camera)
    with zipfile.ZipFile(BytesIO(data)) as z:
        selected = []
        seen_dates = set()
        decode_failures = []
        for name in sorted(z.namelist()):
            stamp = re.search(r'(20\d{6})[_-](\d{6})\.(?:jpe?g)$', name, re.I)
            if not stamp or stamp[1] in seen_dates or z.getinfo(name).file_size > 10_000_000:
                continue
            raw = z.read(name)
            try:
                with Image.open(BytesIO(raw)) as im:
                    if im.width * im.height > 20_000_000:
                        continue
                    thumb = ImageOps.exif_transpose(im).convert('RGB')
                    thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)
                    stat = ImageStat.Stat(thumb.convert('L'))
                    if not 45 <= stat.mean[0] <= 220 or stat.stddev[0] < 15:
                        continue
            except (OSError, ValueError) as error:
                decode_failures.append({'archiveMember': name, 'reason': str(error)[:160]})
                continue
            seen_dates.add(stamp[1])
            selected.append((name, stamp[1], stamp[2]))
        if len(selected) < 3:
            raise ValueError('Fewer than 3 usable distinct dates: ' + camera)
        for q in [.1, .5, .9]:
            name, date, clock = selected[round((len(selected) - 1) * q)]
            raw = z.read(name)
            with Image.open(BytesIO(raw)) as im:
                original_size = list(im.size)
                thumb = ImageOps.exif_transpose(im).convert('RGB')
                thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)
            out = BytesIO(); thumb.save(out, 'PNG')
            encoded = out.getvalue()
            filename = f'images/{camera}-{date}_{clock}.png'
            (ROOT / filename).write_bytes(encoded)
            manifest['images'].append({'id': f'{camera}-{date}_{clock}', 'camera': camera,
                'split': 'calibration' if camera in PLAN['calibration'] else 'validation',
                'file': filename, 'date': f'{date[:4]}-{date[4:6]}-{date[6:]}',
                'captureTimestamp': date + '_' + clock, 'timestampMeaning': 'archive filename; timezone not supplied',
                'sourceUrl': url, 'archiveMember': name, 'archiveMd5': MD5[camera],
                'sourceSha256': sha(raw), 'sha256': sha(encoded), 'originalDimensions': original_size,
                'retainedDimensions': list(thumb.size), 'eligibleDates': len(selected), 'quantile': q})
    manifest.setdefault('decodeFailures', {})[camera] = decode_failures
    del data
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('Retained', camera, '3 dates from', len(selected), 'eligible dates', flush=True)
print('Complete:', len(manifest['images']), 'licensed 512px-or-smaller photos', flush=True)
