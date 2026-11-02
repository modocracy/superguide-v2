# 인수인계 (현재 상황판)

> 작업을 마친 AI가 **덮어써서** 최신으로 유지합니다. 쌓아 두는 일지가 아닙니다. 규칙은 [AGENTS.md](AGENTS.md)를 보세요.

- 마지막 갱신: 2026-11-02, superguide 담당(Claude Code)
- 기준 커밋: `f8ea945` (이 작업은 브랜치 `auto/2026-11-02-warbonds`의 PR #3용이며 master에는 push하지 않음)
- 진행 중인 작업: 없음 (PR #3 검토 대기)

## 최근에 끝난 일

- 전쟁 채권 페이지 추가 및 메인 화면 전환 ([PR #3](https://github.com/modocracy/superguide-v2/pull/3)): 위키 Category:Warbonds의 전쟁 채권 26종(기본 1·프리미엄 22·전설 3)을 출시일·가격·페이지별 해금 메달·항목별 메달 비용과 함께 보여 줍니다. 빈 주소·알 수 없는 주소는 이제 `#/warbonds`로 열리고, 기존 주소·`?lang=en`·Ctrl+K 검색은 그대로입니다.
  - 스크립트: `scripts/fetch-warbonds.mjs`(위키 → `db/source/wiki_warbonds.json`) → `scripts/build-warbonds.mjs`(→ `dist/data/warbonds.js`, 파서 `scripts/warbond-parse.mjs`) → `scripts/test-warbonds.mjs`(`npm run check`에 포함). 한국어 이름은 `db/source/warbond_korean_names.json`.
  - 항목 연결: 무기 92개·스트라타젬 31개가 사이트 상세 화면으로 연결되고 미연결 0개입니다.
  - 위키 전쟁 채권 문서의 `LAS-16 Trident`는 사이트의 LAS-13 Trident와 같은 무기입니다. 무기 문서 revision 140438에 출처 Siege Breakers 1페이지·35메달, 1.006.003 변경 기록에 'LAS-16 Trident'에서 이름 변경이 적혀 있어 `RENAMED`로 명시 연결했습니다.
  - 표지 이미지 26장: `scripts/tools/fetch-warbond-covers.py` → `dist/assets/warbonds/`(240px WebP).
- 전쟁 채권 첫 화면 위에 '최신 출시 채권' 배너 추가(사용자 시안: 전체 폭 표지 띠 + 아래 한 줄에 이름과 '페이지별 목록 보기' 버튼, 수치 칸 없음): 빌드가 출시일이 가장 늦은 채권을 고르고(같은 날이면 영문 제목 순, `latestWarbondId`), 큰 표지는 `python3 scripts/tools/fetch-warbond-covers.py --latest-large`로 그 채권만 받습니다(현재 Scope of Authority, 1600×800·118,888바이트). 데이터 갱신으로 최신 채권이 바뀌면 이 명령을 다시 실행해야 검사가 통과합니다.

## 남은 일 (각각 사용자 승인 후 진행)

- StA-52 예비 탄창: datamine은 7, 위키 인포박스는 아직 6입니다(revision 140347 기준). 위키가 7로 바뀌면 `db/source`를 다시 받고 `scripts/weapon-infobox.mjs`의 기록된 불일치 항목을 지웁니다.
- Caustic Strain 팩션 안내 추가: 위키 하위 팩션 Caustic Strain(revision 140771)에는 Bile Spitter·Bile Warrior·Bile Spewer·Spore Charger가 속하고, 부위 데이터는 저장소에 이미 있습니다. `factionGuides`에 항목 1개, 유닛 4종의 한국어 설명, `faction-loadouts.js` 무기 추천, 영어 사전이 필요합니다. 위키 전술 정보가 아직 비어 있어서("Missing information") 무기 추천 근거가 부족합니다. 사용자가 추천 방향을 정해 주면 진행합니다.
- 반영하지 않은 것: Eagle Fly By / Orbital Confetti(피해 없음), LAS-44 Nova의 Anti-Tank 태그.
- 전쟁 채권 위키 불일치 '미확인' 21건(전체 목록은 PR #3 설명과 `warbondDiscrepancies`): 비용 차이 Scope of Authority 2·Entrenched Division 2·Castellan's Creed 1, 이름 표기 Boundary Banner/Banker 2, Ironclad Democracy 부스터 2종의 페이지 뒤바뀜 2, 마지막 페이지 해금 ≠ all-pages 3(Ironclad·Redacted·Siege Breakers), 2페이지 해금 메달 없음 9. 위키가 고쳐지면 다시 받아 빌드합니다.
- 휴대폰 하단 탭 6칸(전쟁 채권 추가)과 전쟁 채권 화면 배치를 실제 브라우저로 확인하지 못했습니다. 확인이 필요합니다.

## 사용자가 이미 정한 것 (다시 묻지 않기)

- Elevated Overseer 몸통은 위키 표(400)가 아니라 공식 패치 노트 값(450)을 씁니다(`anatomyOfficial`).
- Voteless Heavy 팔 피해 상한 변경은 반영한 상태로 유지합니다.
- TypeSafe Jev 같은 AI 기능은 사이트에 넣지 않습니다. 데이터·번역 대량 검사에만 씁니다.
- 팩션별 장비 평가 기능은 보류 중입니다. 사용자가 다시 꺼내기 전에는 제안하지 않습니다.
- 사이트 메인 화면은 전쟁 채권 페이지입니다.
- Exo Experts의 한국어 이름은 '외계 전문가(오역)'입니다(게임 공식 오역을 그대로 보여 줌).
- 한국어 전쟁 채권 이름은 게임 내 표기와 같으므로 출처를 표기하지 않습니다.

## 다음 AI에게

- 위키 데이터를 갱신할 때는 위키 revision을 먼저 확인하고, `scripts/fetch-*` → `build-*` → `npm run check` 순서로 진행하세요.
- 전쟁 채권 갱신: `node scripts/fetch-warbonds.mjs` → `node scripts/build-warbonds.mjs` → `npm run check`. 새 전쟁 채권이 생기면 `db/source/warbond_korean_names.json`에 한국어 이름이 없어서 빌드가 실패하니, 사용자에게 이름을 받아 넣으세요.
- wiki.gg는 curl 기본 User-Agent로 받으세요. 브라우저(Mozilla) User-Agent를 쓰면 차단 페이지가 옵니다. revision 확인에는 MediaWiki API(`api.php?action=query&prop=revisions`)가 편합니다.
- `scripts/tools/fetch-weapon-images.py`는 모든 이미지를 다시 인코딩합니다. 바뀌지 않은 이미지까지 바이트가 달라지니 새 이미지·원본이 바뀐 이미지만 커밋하세요. 이미지 하나만 필요하면 그 무기만 같은 방식으로 처리하는 편이 안전합니다.
