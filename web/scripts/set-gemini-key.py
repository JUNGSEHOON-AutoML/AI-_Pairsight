#!/usr/bin/env python3
"""Run by the user in a terminal; never pass a key in command arguments."""
import getpass
import os
from pathlib import Path
import re
import sys


def main():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError("대화형 터미널에서 직접 실행해 주세요.")
    target = Path(__file__).resolve().parents[1] / ".env.local"
    if target.exists():
        raise ValueError(".env.local이 이미 있습니다. 기존 설정을 보존하기 위해 종료합니다.")
    key = getpass.getpass("Gemini API 키 (화면에 표시되지 않음): ")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{20,256}", key):
        raise ValueError("입력 형식을 확인해 주세요. 입력값은 표시하지 않습니다.")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write("GEMINI_API_KEY=" + key + "\n")
    print(".env.local에 저장했습니다. 키 값은 출력하지 않았습니다.")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, EOFError, KeyboardInterrupt):
        print("키를 저장하지 못했습니다. 입력값과 오류 세부 내용은 숨겼습니다.", file=sys.stderr)
        sys.exit(1)
