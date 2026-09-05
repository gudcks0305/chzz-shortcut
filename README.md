# 치지직 이모티콘 단축키

치지직 채팅창에서 **Alt + 1~9**로 지정한 이모티콘을 넣는 Chrome Manifest V3 확장 프로그램입니다. macOS에서는 **Option + 1~9**를 사용합니다. 이모티콘은 치지직 기본 선택 버튼을 통해 입력되며, 전송은 직접 Enter를 눌러야 합니다.

## 설치

1. Chrome 주소창에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
4. 이 README와 `manifest.json`이 있는 `chzz-shortcut` 폴더를 선택합니다. ZIP을 받았다면 먼저 압축을 해제하세요.
5. 이미 열어둔 치지직 탭을 새로고침합니다.

소스 폴더를 그대로 설치할 수 있습니다. 설치·실행에는 Node나 npm이 필요하지 않습니다.

## 사용

1. 로그인한 치지직 방송에서 채팅 입력창 옆 **⌨** 버튼을 누릅니다.
2. 원하는 숫자 슬롯의 **등록**을 누릅니다.
3. 열린 치지직 이모티콘 창에서 **해당 이모티콘 팩 탭**을 고른 뒤 이모티콘을 클릭합니다. 최근 목록에서는 팩 정보를 알 수 없으므로 등록할 수 없습니다.
4. 등록 완료 안내를 확인합니다. 등록할 때는 이모티콘을 채팅에 넣지 않습니다.
5. 채팅 입력창을 클릭하고 **Alt/Option + 숫자**를 누릅니다. 치지직의 기본 이모티콘 선택 동작과 동일하게 초안 끝에 추가됩니다.

- 1~9 및 숫자패드를 지원합니다.
- 설정에서 `Alt/Option + Shift + 숫자`로 조합을 변경할 수 있습니다.
- **변경**은 기존 슬롯 재등록, **×**는 슬롯 삭제입니다.
- **사용** 체크를 끄면 단축키를 일시 중지합니다.
- 등록 중 **Esc**를 누르면 취소합니다. 60초 후에도 자동 취소됩니다.
- 설정은 현재 브라우저의 확장 저장소에 저장되며 모든 치지직 방송에서 공유됩니다. 확장을 삭제하면 설정도 삭제됩니다.

## 동작 범위

- 채팅 입력창에 포커스가 있을 때만 동작합니다. 한글 조합 중인 입력과 다른 입력창은 건드리지 않습니다.
- 등록된 키를 길게 눌러도 중복 삽입하지 않습니다.
- 해당 계정에서 현재 사용할 수 있는 치지직 이모티콘만 선택합니다. 구독 만료·잠긴 팩·채팅 제한·메시지 길이 제한은 치지직이 적용합니다.
- 팩이나 이모티콘을 찾지 못하면 안내를 표시합니다. 팩을 다시 선택해 재등록하세요.
- 권한은 `storage`, 콘텐츠 스크립트 실행 범위는 `https://chzzk.naver.com/*`입니다. 별도 서버, API 키, 채팅 전송 API, 원격 실행 코드가 없습니다. 미리보기 이미지는 네이버 `pstatic.net` CDN에서 로드합니다.

## 개발 및 검증

```sh
npm ci
npm run check
npm test
npm run package
```

`outputs/chzz-shortcut/`에 설치용 폴더, `outputs/chzz-shortcut-0.1.0.zip`에 ZIP을 만듭니다. ZIP 생성에는 `zip` 명령이 필요합니다.

자동 테스트 13개는 키 조합, 반복 키, IME, 포커스 범위, 등록 시 클릭 차단, 비동기 팩 전환, 페이지 이동 취소, 잠금, 저장 실패, 삭제, 입력창 상태 전환을 검증합니다.

2026-09-05 Aside CLI로 로그인된 치지직 별도 테스트 탭에서 확인:

- 대기 상태 `textarea`에 설정 버튼 표시 및 활성 상태 `pre`로의 전환.
- 기본 팩 `dp_1`의 `d_1`을 등록할 때 초안 이미지 0개.
- 단축키로 이미지 1개 삽입 및 치지직 내부 초안 토큰 반영.
- 다른 팩 `lckp_1`이 열린 상태에서 Aside 키보드의 `Alt+1` 입력으로 저장한 팩을 자동 선택한 뒤 삽입.
- 설정 패널의 9개 슬롯·조합 선택·등록 미리보기 화면 확인.
- 테스트 중 채팅 전송하지 않음.

라이브 테스트는 Chrome 콘텐츠 스크립트와 같은 **격리된 JavaScript 실행 공간**에 소스 코드를 주입하고, `chrome.storage`는 메모리 테스트 대역을 사용했습니다. 실제 확장 설치 후의 저장 유지와 Chrome 자체 단축키 충돌은 설치한 브라우저에서 추가 확인해야 합니다. 치지직 DOM이 바뀌면 선택자 조정이 필요할 수 있습니다.

## 구현 근거

- [Chrome 콘텐츠 스크립트](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome 확장 저장소](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome 공식 저장소 예제](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/storage)
- [치지직 배포 번들 — 2026-09-05 확인](https://ssl.pstatic.net/static/nng/glive/resource/p/static/js/index-ABBxfRiy.js)
- [CHZZK Plus의 기본 이모티콘 선택 경로 참고](https://github.com/kyechan99/chzzk-plus/blob/bdee489a324b3d18d4903f0aa2d40bbf14c7c35f/src/components/ChatEmojiSearch/ChatEmojiSearch.tsx)

외부 소스는 DOM·동작 확인에 참고했습니다. NAVER 또는 치지직의 공식 확장 프로그램이 아닙니다.
