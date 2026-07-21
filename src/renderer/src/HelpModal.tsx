import { useState } from 'react'
import authorUrl from './assets/author.png'
import { VERSION_LABEL } from '@shared/constants'

/** 단축키·사용법 안내. 외울 필요 없게 언제든 열어볼 수 있어야 한다. */

const AUTHOR = {
  name: '나태한유신',
  github: 'https://github.com/Redater2254',
  discord: 'lazyyushin',
  /** 버그·건의를 받는 곳. 사용자가 여기서 막히면 앱을 그냥 지운다 */
  feedback: 'https://www.sooplive.com/station/lysrobert/post/202141189'
}

/**
 * 만든 사람.
 *
 * 문제가 생겼을 때 **어디로 말해야 하는지**가 없으면 사용자는 그냥 앱을 지운다.
 * GitHub 은 눌러서 열고, 디스코드는 주소가 아니라 아이디라 복사해 가게 한다.
 */
function AuthorCard(): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  return (
    <section className="help-author">
      <img src={authorUrl} alt="" />
      <div>
        <b>{AUTHOR.name}</b>
        <em>만든 사람 · {VERSION_LABEL}</em>
        <div className="help-links">
          <button
            className="report"
            title="이상한 점이나 있었으면 하는 기능을 남겨주세요"
            onClick={() => window.endcredit.app.openUrl(AUTHOR.feedback)}
          >
            버그 제보 · 건의 ↗
          </button>
          <button onClick={() => window.endcredit.app.openUrl(AUTHOR.github)}>GitHub ↗</button>
          <button
            className={copied ? 'ok' : ''}
            title="디스코드 아이디를 복사합니다"
            onClick={() => {
              void navigator.clipboard.writeText(AUTHOR.discord)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
          >
            {copied ? '복사됨' : `Discord · ${AUTHOR.discord}`}
          </button>
        </div>
      </div>
    </section>
  )
}

interface Row {
  keys: string
  what: string
}

interface Section {
  title: string
  rows: Row[]
  note?: string
}

const SECTIONS: Section[] = [
  {
    title: '파일',
    rows: [
      { keys: 'Ctrl + N', what: '처음부터 새로 (저장 안 했으면 먼저 물어봅니다)' },
      { keys: 'Ctrl + S', what: '즉시 저장' },
      { keys: 'Ctrl + Shift + S', what: '이름 붙여 저장 (여러 벌 남기기)' },
      { keys: 'Ctrl + Z', what: '되돌리기' },
      { keys: 'Ctrl + Shift + Z / Ctrl + Y', what: '다시 실행' }
    ],
    note:
      '편집 내용은 바꿀 때마다 자동 저장되지만, 그건 “지금 쓰는 것” 한 벌뿐입니다. ' +
      '여러 벌을 남기려면 이름을 붙여 저장하세요. 문서 이름 옆 주황 점은 “아직 이름을 붙이지 않았다”는 뜻입니다.'
  },
  {
    title: '요소 다루기',
    rows: [
      { keys: '클릭', what: '선택 — 그대로 끌면 이동' },
      { keys: 'Ctrl + T', what: '자유 변형 — 크기 손잡이가 나타남 (Esc 로 끝냄)' },
      { keys: '두 번 클릭', what: '글자를 그 자리에서 편집 (일부만 골라 색·크기 변경)' },
      { keys: 'Shift + 클릭', what: '여러 개 선택' },
      { keys: 'Alt + 클릭', what: '묶음 안에서 하나만 선택' },
      { keys: 'Ctrl + A', what: '이 슬라이드 전체 선택' },
      { keys: 'Delete', what: '선택 삭제' },
      { keys: 'Ctrl + C / X / V', what: '복사 / 잘라내기 / 붙여넣기' },
      { keys: 'Ctrl + D', what: '복제 (살짝 어긋나게)' },
      { keys: 'Ctrl + J', what: '제자리 복제 (같은 위치에 겹쳐서)' },
      { keys: 'Ctrl + G', what: '묶기 · 묶인 상태에서 다시 누르면 해제' },
      { keys: '오른쪽 클릭', what: '메뉴 — 복사·순서·묶기·삭제를 한자리에서' },
      { keys: 'Esc', what: '선택 해제' }
    ],
    note:
      '크기 손잡이는 자유 변형(Ctrl+T)에서만 나옵니다 — 옮기려다 크기를 건드리는 일을 막기 위해서입니다. ' +
      '다른 슬라이드에 붙여넣으면 원래 위치 그대로, 같은 슬라이드면 살짝 어긋나게 들어갑니다.'
  },
  {
    title: '옮기고 크기 바꾸기',
    rows: [
      { keys: '드래그', what: '이동 (기준선에 자석처럼 붙음)' },
      { keys: 'Shift + 드래그', what: '가로 또는 세로로만 이동' },
      { keys: 'Shift + 모서리', what: '비율 유지하며 크기 조절 (자유 변형 중)' },
      { keys: 'Ctrl + 드래그', what: '자석 잠시 끄기 (미세 조정)' },
      { keys: '화살표 키', what: '1px 씩 미세 이동 (잡은 게 없으면 슬라이드 넘기기)' },
      { keys: 'Shift + 화살표', what: '10px 씩 이동' },
      { keys: '빈 곳 드래그', what: '범위로 여러 개 잡기 (Shift 로 기존 선택에 추가)' },
      { keys: '회전 손잡이', what: '자유 변형 중 위쪽 동그라미 — Shift 는 15°씩' }
    ],
    note: '분홍 선이 나타나면 캔버스 중앙이나 다른 요소에 맞춰진 것입니다.'
  },
  {
    title: '방송에서 틀기',
    rows: [
      { keys: 'Ctrl + Alt + E', what: '크레딧 재생 / 정지 — 어느 창에 있든' },
      { keys: 'Ctrl + Alt + R', what: '처음부터 다시' }
    ],
    note:
      '게임이 전체화면이어도 눌립니다. 다른 프로그램이 같은 키를 쓰고 있으면 위쪽 “🔗 연결” 에서 ' +
      '빨갛게 표시됩니다 — 그럴 땐 OBS 리모컨을 쓰세요.'
  },
  {
    title: '화면 보기',
    rows: [
      { keys: 'Space + 드래그', what: '손도구 — 화면 이동' },
      { keys: 'Ctrl + Space + 드래그', what: '돋보기 — 좌우로 끌어 확대·축소' },
      { keys: 'Ctrl + 휠', what: '확대 · 축소' }
    ]
  }
]

const FLOW = [
  {
    step: '1',
    title: '슬라이드로 나누기',
    body: '왼쪽이 슬라이드 목록입니다. 한 장에 하나씩 보여주세요 — 수다왕 한 장, 별풍선 한 장.'
  },
  {
    step: '2',
    title: '요소 얹기',
    body: '캔버스 위 도구로 텍스트·이미지·순위를 놓습니다. 순위는 “등수 하나”로 1·2·3등을 따로 둘 수 있어, 등수마다 다른 효과를 줄 수 있습니다.'
  },
  {
    step: '3',
    title: '데이터 꽂기',
    body: '아래 “데이터 필드” 탭에서 값을 끌어다 놓으면 그 자리에 들어갑니다. 텍스트 안에 섞어 “오늘의 수다왕은 OOO님!” 처럼 쓸 수도 있습니다.'
  },
  {
    step: '4',
    title: '효과 걸기',
    body:
      '아래 “효과” 탭에서 타일을 요소나 슬라이드로 끌어다 놓습니다. 슬라이드에 놓으면 장 전환 효과가 됩니다. ' +
      '등장·강조·퇴장은 서로 다른 칸이라 한 요소에 셋 다 걸 수 있습니다 — 왼쪽에서 들어와 반짝이다 오른쪽으로 나가기. ' +
      '“화면” 칸에는 폭죽·눈·반짝이처럼 장 전체를 덮는 효과가 있습니다 (캔버스나 슬라이드에 끌어다 놓으세요).'
  },
  {
    step: '5',
    title: '소리 넣기',
    body:
      '아래 “소리” 탭에서 배경음악(크레딧 전체)과 효과음(장마다 하나)을 고릅니다. ' +
      'OBS 브라우저 소스 속성에서 “OBS를 통해 오디오 제어”를 켜야 시청자에게 들립니다.'
  },
  {
    step: '6',
    title: 'OBS 로 내보내기',
    body:
      'OBS → 소스 + → 브라우저 → http://localhost:7396/overlay (1920×1080). ' +
      '“소스가 보이지 않을 때 종료”는 체크 해제하세요. 위쪽 “🔗 연결” 에서 주소를 복사할 수 있습니다.'
  },
  {
    step: '7',
    title: '방송 마지막에 틀기',
    body:
      '전체화면 게임에서 앱 창을 찾을 필요 없이 Ctrl+Alt+E 를 누르세요. ' +
      'OBS 안에 버튼을 두고 싶으면 도구 → 사용자 정의 브라우저 독에 ' +
      'http://localhost:7396/remote 를 넣으면 재생 버튼이 붙습니다.'
  },
  {
    step: '8',
    title: '남에게 주기',
    body:
      '“불러오기 ▾ → 내보내기(.ecpreset)” 는 이미지·소리까지 한 파일에 담습니다. ' +
      '받은 사람은 같은 메뉴의 “가져오기” 로 열면 됩니다.'
  }
]

export function HelpModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="help-back" onClick={onClose}>
      <div className="help" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>도움말</h2>
          <button onClick={onClose}>닫기</button>
        </header>

        <div className="help-body">
          <AuthorCard />

          <section className="help-flow">
            <h3>이렇게 만듭니다</h3>
            {FLOW.map((f) => (
              <div key={f.step} className="flow-item">
                <b>{f.step}</b>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.body}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="help-keys">
            {SECTIONS.map((s) => (
              <div key={s.title} className="help-sec">
                <h3>{s.title}</h3>
                <table>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.keys}>
                        <td>
                          <kbd>{r.keys}</kbd>
                        </td>
                        <td>{r.what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.note && <p className="help-note">{s.note}</p>}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
