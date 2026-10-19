#!/usr/bin/env python3
"""Local administrator provisions an operator. Passwords never appear in arguments or output."""
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys

def main():
    if not sys.stdin.isatty():
        raise ValueError("대화형 터미널에서 실행해 주세요.")
    target = Path(__file__).resolve().parents[1] / ".newsroom" / "operators.json"
    ident = input("운영자 아이디 (영문·숫자·-·_, 3~60자): ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{3,60}", ident):
        raise ValueError("아이디 형식을 확인해 주세요.")
    password = getpass.getpass("운영자 비밀번호 (12자 이상, 화면에 표시되지 않음): ")
    if len(password) < 12 or len(password) > 256 or password != getpass.getpass("비밀번호 다시 입력: "):
        raise ValueError("비밀번호 길이 또는 두 입력이 다릅니다.")
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    users = json.loads(target.read_text()) if target.exists() else []
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    users = [u for u in users if u["id"] != ident] + [{"id": ident, "salt": salt, "digest": digest}]
    fd = os.open(str(target) + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(users, f)
    os.replace(str(target) + ".tmp", target)
    print("운영자를 등록했습니다. 비밀번호는 해시로만 저장했습니다.")

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, EOFError, KeyboardInterrupt):
        print("등록하지 못했습니다. 입력과 오류 원문은 숨겼습니다.", file=sys.stderr)
        sys.exit(1)
