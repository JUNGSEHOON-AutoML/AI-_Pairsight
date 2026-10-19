// RSS 2.0 / Atom parsing for the hash index. Images are taken from the feed only; article pages are never opened
// during collection (replica/rss-hash-index.md: "RSS에 이미지가 없는 기사는 색인되지 않습니다").
import { load } from "cheerio";

export interface FeedItem {
  link: string;
  publishedAt: string | null; // ISO
  imageUrl: string | null;
}

const absolute = (value: string | undefined, base: string): string | null => {
  if (!value) return null;
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};
const iso = (value: string | undefined) => {
  if (!value) return null;
  const t = Date.parse(value.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export function parseFeed(xml: string, feedUrl: string, max = 30): FeedItem[] {
  const $ = load(xml, { xml: true });
  const items: FeedItem[] = [];
  const nodes = $("item").length ? $("item") : $("entry");
  nodes.each((_, el) => {
    if (items.length >= max) return false;
    const it = $(el);
    const link = absolute(it.children("link").first().text() || it.children("link").first().attr("href"), feedUrl);
    if (!link) return;
    const imageFromMedia =
      it.find("media\\:content[medium='image'], media\\:content[type^='image']").first().attr("url") ??
      it.find("media\\:content").filter((_, m) => /\.(jpe?g|png|webp)(\?|$)/i.test($(m).attr("url") ?? "")).first().attr("url") ??
      it.find("media\\:thumbnail").first().attr("url") ??
      it.find("enclosure[type^='image']").first().attr("url");
    let imageUrl = absolute(imageFromMedia, link);
    if (!imageUrl) {
      const html = it.children("description").text() || it.find("content\\:encoded").text() || it.children("content").text();
      const src = html ? load(html)("img").first().attr("src") : undefined;
      imageUrl = absolute(src, link);
    }
    items.push({
      link,
      publishedAt: iso(it.children("pubDate").text() || it.children("published").text() || it.children("updated").text() || it.find("dc\\:date").text()),
      imageUrl,
    });
  });
  return items;
}
