# 인수인계 (현재 상황판)

> 작업을 마친 AI가 **덮어써서** 최신으로 유지합니다. 쌓아 두는 일지가 아닙니다. 규칙은 [AGENTS.md](AGENTS.md)를 보세요.

- 마지막 갱신: 2026-10-31, superguide 담당(Claude Code)
- 기준 커밋: `bb7a2ce` Add shared rules and a handoff board for AI collaborators (이 작업은 브랜치 `auto/2026-10-31-handoff-fixes`의 PR용이며 master에는 push하지 않음)
- 진행 중인 작업: 없음

## 최근에 끝난 일

- AR-23L 리버레이터 레거시 이미지 추가: 위키 `File:AR-23L Liberator Primary Render.png`(sha1 `ee6b7ec9…`, 2026-10-26 업로드, 무기 페이지 revision 140750). `dist/assets/weapons/liberator-legacy.webp`를 새로 만들고 `dist/data/weapon-images.js`에 한 줄을 넣었습니다. `fetch-weapon-images.py`와 같은 방식(480px 썸네일, 투명 여백 잘라냄, WebP 품질 86)으로 이 이미지 하나만 처리해서 다른 이미지는 바뀌지 않았습니다.
- StA-52 예비 탄창 확인: 위키 인포박스(revision 140347, 2026-10-25)는 아직 `spare_mags = 6`입니다. 기록된 불일치 항목은 그대로 둡니다.
- 담즙 변종 확인: 위키에서는 이 적들을 하위 팩션 **Caustic Strain**(revision 140771)으로 묶습니다. 소속은 Bile Spitter(139149), Bile Warrior(139144), Bile Spewer(139148), Spore Charger(140019)입니다. 위키에 "Bile Scavenger"라는 적은 없고, 바일 스피터가 스캐빈저·파운서 자리를 대신합니다. 네 적의 부위 데이터는 저장소에 이미 있고 위 revision과 같습니다. 다만 팩션 안내(`dist/data/faction-data.js`)에는 이 하위 팩션이 아직 없습니다.

## 남은 일 (각각 사용자 승인 후 진행)

- StA-52 예비 탄창: datamine은 7, 위키 인포박스는 아직 6입니다. 위키가 7로 바뀌면 `db/source`를 다시 받고 `scripts/weapon-infobox.mjs`의 기록된 불일치 항목을 지웁니다.
- Caustic Strain 팩션 안내 추가: `factionGuides`에 항목 1개, 유닛 4종의 한국어 설명, `faction-loadouts.js` 무기 추천, 영어 사전이 필요합니다. 위키 전술 정보가 아직 비어 있어서("Missing information") 무기 추천 근거가 부족합니다. 그래서 이번에는 추가하지 않았습니다. 사용자가 추천 방향을 정해 주면 진행합니다.
- 반영하지 않은 것: Eagle Fly By / Orbital Confetti(피해 없음), LAS-44 Nova의 Anti-Tank 태그.

## 사용자가 이미 정한 것 (다시 묻지 않기)

- Elevated Overseer 몸통은 위키 표(400)가 아니라 공식 패치 노트 값(450)을 씁니다(`anatomyOfficial`).
- Voteless Heavy 팔 피해 상한 변경은 반영한 상태로 유지합니다.
- TypeSafe Jev 같은 AI 기능은 사이트에 넣지 않습니다. 데이터·번역 대량 검사에만 씁니다.
- 팩션별 장비 평가 기능은 보류 중입니다. 사용자가 다시 꺼내기 전에는 제안하지 않습니다.

## 다음 AI에게

- 위키 데이터를 갱신할 때는 위키 revision을 먼저 확인하고, `scripts/fetch-*` → `build-*` → `npm run check` 순서로 진행하세요.
- wiki.gg는 curl 기본 User-Agent로 받으세요. 브라우저(Mozilla) User-Agent를 쓰면 차단 페이지가 옵니다. revision 확인에는 MediaWiki API(`api.php?action=query&prop=revisions`)가 편합니다.
- `scripts/tools/fetch-weapon-images.py`는 모든 이미지를 다시 인코딩합니다. 바뀌지 않은 이미지까지 바이트가 달라지니 새 이미지·원본이 바뀐 이미지만 커밋하세요. 이미지 하나만 필요하면 이번처럼 그 무기만 같은 방식으로 처리하는 편이 안전합니다.
