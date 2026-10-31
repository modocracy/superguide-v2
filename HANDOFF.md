# 인수인계 (현재 상황판)

> 작업을 마친 AI가 **덮어써서** 최신으로 유지합니다. 쌓아 두는 일지가 아닙니다. 규칙은 [AGENTS.md](AGENTS.md)를 보세요.

- 마지막 갱신: 2026-10-31, Claude
- 기준 커밋: `60233c1` Refresh from the wiki for patch 1.007.202 (push 완료)
- 진행 중인 작업: 없음

## 최근에 끝난 일

- 패치 1.007.202 기준 위키 재수집(60233c1): 무기 datamine revision 140989, 적 부위 스냅샷 갱신. 무기 107종, 스트라타젬 113종.
- Apex 철거력 30, Accelerator 재장전 2.7초, AR-23L 리버레이터 레거시 추가, Sightliner를 저격소총으로 분류.

## 남은 일 (각각 사용자 승인 후 진행)

- AR-23L 리버레이터 레거시 이미지가 아직 없습니다.
- StA-52 예비 탄창: datamine은 7, 위키 인포박스는 아직 6입니다. 위키가 7로 바뀌면 `scripts/weapon-infobox.mjs`의 기록된 불일치 항목을 지웁니다.
- 새 담즙(Bile) 변종(Bile Warrior, Spewer, Scavenger)이 팩션 추천에 빠져 있을 수 있습니다. 먼저 확인이 필요합니다.
- 반영하지 않은 것: Eagle Fly By / Orbital Confetti(피해 없음), LAS-44 Nova의 Anti-Tank 태그.

## 사용자가 이미 정한 것 (다시 묻지 않기)

- Elevated Overseer 몸통은 위키 표(400)가 아니라 공식 패치 노트 값(450)을 씁니다(`anatomyOfficial`).
- Voteless Heavy 팔 피해 상한 변경은 반영한 상태로 유지합니다.
- TypeSafe Jev 같은 AI 기능은 사이트에 넣지 않습니다. 데이터·번역 대량 검사에만 씁니다.
- 팩션별 장비 평가 기능은 보류 중입니다. 사용자가 다시 꺼내기 전에는 제안하지 않습니다.

## 다음 AI에게

- 위키 데이터를 갱신할 때는 위키 revision을 먼저 확인하고, `scripts/fetch-*` → `build-*` → `npm run check` 순서로 진행하세요.
- `scripts/tools/fetch-weapon-images.py`는 모든 이미지를 다시 인코딩합니다. 바뀌지 않은 이미지까지 바이트가 달라지니 새 이미지·원본이 바뀐 이미지만 커밋하세요.
