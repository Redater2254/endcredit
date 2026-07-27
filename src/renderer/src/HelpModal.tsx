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
      { keys: 'Ctrl + E', what: '선택을 한 장의 이미지로 병합 (모양은 그대로, 데이터·효과는 고정)' },
      { keys: 'L · V', what: '올가미 도구 · 이동 도구 — 올가미는 자유곡선으로 감싼 것을 선택' },
      {
        keys: 'R',
        what: '도형 도구 — 캔버스에 끌어서 그립니다 (Shift 로 정사각형·정원, R 을 다시 누르면 사각형→타원→선)'
      },
      { keys: '오른쪽 클릭', what: '메뉴 — 복사·순서·묶기·삭제 (요소칸의 줄을 우클릭하면 레이어별 기능)' },
      { keys: '두 번 클릭', what: '글자 편집 · 고급 개체는 그 안으로 들어가기' },
      { keys: 'Esc', what: '선택 해제 · 도구를 이동으로 · 고급 개체에서 나오기' }
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
      {
        keys: '새 버전',
        what: '앱을 켤 때 알아서 확인합니다. 받는 건 “받기” 를 눌러야 시작하고, 설치는 앱을 끌 때 — 방송 중에 재시작되는 일은 없습니다. 설치가 끝나면 앱이 스스로 다시 켜집니다 (수집·송출 중에는 확인도 안 합니다)'
      },
      { keys: 'Ctrl + Alt + E', what: '크레딧 재생 / 정지 — 어느 창에 있든' },
      { keys: 'Ctrl + Alt + R', what: '처음부터 다시' },
      {
        keys: '▶ 이 장만 방송',
        what: '지금 보고 있는 장 하나만 OBS 로 — 그 장이 끝나면 자동으로 멈춤. 단축키·리모컨으로 트는 것은 언제나 전체'
      }
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
      { keys: 'Ctrl + 휠', what: '확대 · 축소' },
      { keys: 'Ctrl + Shift + L', what: '밝은 테마 · 어두운 테마 전환' },
      { keys: '머리말 오른쪽 %', what: 'UI 크기 — 앱 글자·버튼이 너무 작거나 클 때' }
    ],
    note:
      '테마는 앱 화면만 바뀝니다 — 방송에 나가는 크레딧은 그대로입니다. ' +
      'UI 크기도 마찬가지로 앱 화면만 바뀝니다. 기본값 "자동" 은 모니터 해상도·배율에 맞춰 ' +
      '알아서 정하고, 창을 다른 모니터로 옮기면 그 모니터에 다시 맞춥니다.'
  },
  {
    title: '특이한 요소 · 효과',
    rows: [
      {
        keys: '🚂 기차',
        what: '효과 라이브러리 “특이 효과” 칸에서 꺼냄 — 등수·이름·수치를 칸에 태우고 화면을 한 번 가로지름 (칸 비율·글자 크기·글자 영역 · 양 끝 칸 이미지 한 장 + 가운데 칸 이미지들 · 칸 수 · 방향 · 지나가는 시간 · 칸 위 장식 위치·크기 · 칸 강조)'
      },
      { keys: '흐르는 자막', what: '강조 효과 — 글자가 오른쪽에서 왼쪽으로 계속 흐름 (넓은 글상자에)' },
      { keys: '타자기', what: '등장 효과 — 글자가 왼쪽부터 한 칸씩 찍히듯 나타남' },
      {
        keys: '고급 개체',
        what: '여러 요소를 레이어 한 줄로 접음 — 두 번 누르면 그 안이 자기 캔버스로 열리고, 복제한 사본은 원본과 연결됨'
      },
      {
        keys: '요소칸 우클릭',
        what: '레이어별 기능 — 잠금·숨김·순서·효과 복사/붙여넣기·묶기·고급 개체 변환'
      },
      { keys: '자물쇠', what: '잠근 요소는 캔버스에서 안 움직임 · 요소칸의 자물쇠를 눌러 해제' },
      {
        keys: '재생 타임라인',
        what: '캔버스 아래 막대를 찍으면 그 순간에 화면을 세워 놓고 봄 — 처음부터 재생하지 않아도 됨 (캔버스를 누르거나 Esc 로 편집 복귀)'
      },
      {
        keys: '글자 자동 맞춤',
        what: '상자를 넘치면 글자 크기를 줄여 맞춤 — 닉네임 길이가 제각각인 순위·기차 칸에 (글자 속성)'
      },
      {
        keys: '그림 끌어다 놓기',
        what: '탐색기에서 캔버스로 바로 끌어옴 — 놓은 자리에 원래 비율대로 들어감 (여러 장 한꺼번에도 됨)'
      },
      {
        keys: '파일 창 위치',
        what: '지난번에 고른 폴더에서 열림 — 이미지·소리·프리셋을 따로 기억함'
      },
      {
        keys: '명단 자동 흐름',
        what: '순위 목록의 열 수를 “자동”으로 두면 상자 끝에 닿을 때 다음 열 맨 위로 넘어가 계속 쌓임 — 새 열이 생기는 쪽(오른쪽/왼쪽)과 가로 흐름(아래/위)도 고를 수 있음. 몇 명일지 모르는 명단에'
      },
      {
        keys: '도형 꾸미기',
        what: '글자와 같은 항목을 도형에도 — 그라데이션(두 색·방향)·테두리 여러 겹·그림자 여러 겹·모서리 둥글기 (도형 속성)'
      },
      {
        keys: '이미지 꾸미기',
        what: '테두리(액자)·그림자 여러 겹 — 그림자는 상자가 아니라 그림 모양을 따라감 (뚫린 PNG 면 인물 윤곽대로). 무거워서 세 겹까지'
      },
      {
        keys: '화면 크기',
        what: '세로 9:16(쇼츠)·정사각·720p 로 바꿀 수 있음 — 빈 곳을 눌러 나오는 슬라이드 속성 맨 위'
      }
    ],
    note:
      '기차와 흐르는 자막은 안에 데이터·글자를 실어 나르는 특이 효과입니다. ' +
      '고급 개체는 포토샵의 스마트 오브젝트와 같습니다 — 접으면 레이어 한 줄이 되어 통째로 ' +
      '늘이고 돌릴 수 있고(안쪽 글자 크기도 함께 커집니다), 두 번 누르면 그 안이 별도 화면으로 ' +
      '열려 원래 좌표 그대로 고칩니다. Ctrl+J 로 복제한 사본은 내용이 연결되어 한 곳만 고쳐도 ' +
      '전부 바뀝니다(요소칸의 ⧉ 표시). Esc 로 나옵니다. ' +
      '폭죽·색종이·눈·꽃잎·하트 같은 화면 전체 효과는 “화면” 칸에 있습니다.'
  },
  {
    title: '효과 직접 만들기',
    rows: [
      { keys: '효과 만들기 타일', what: '아래 효과 라이브러리 맨 앞의 + 칸' },
      { keys: '연필 (✎)', what: '내가 만든 효과 타일 위에서 — 다시 고치기' },
      { keys: '효과 만들기 칸', what: '전용 창이 열립니다 — 크레딧을 보면서 다듬을 수 있습니다' },
      { keys: '⏱ 스톱워치', what: '그 줄을 움직이게 켜기 (끄면 효과에 관여하지 않음)' },
      { keys: '눈금자 드래그', what: '재생 헤드 옮기기 — 그 순간의 모습이 그대로 보입니다' },
      { keys: '파란 숫자', what: '끌면 값이 바뀌고, 누르면 고쳐 씁니다' },
      { keys: '숫자 바꾸기', what: '재생 헤드 자리에 키프레임이 찍힙니다' },
      { keys: '마름모 (◆)', what: '눌러서 고르기 · 끌어서 시점 옮기기' },
      { keys: 'Space', what: '재생 · 멈춤 (Home 처음으로 · End 끝으로)' },
      { keys: 'Ctrl + Z', what: '효과 편집만 되돌리기 — 크레딧 문서와 섞이지 않습니다' },
      { keys: '속도 곡선', what: '동그라미를 끌면 가속·감속. 상자 밖으로 빼면 튕깁니다' }
    ],
    note:
      '프리미어 프로의 «효과 컨트롤» 과 같은 방식입니다 — 위치 X·Y, 크기 X·Y, 회전, ' +
      '기울이기 X·Y, 불투명도, 흐림이 각자 트랙을 가져, 크기는 세 번 꺾이고 불투명도는 두 번만 ' +
      '꺾이게 할 수 있습니다. 시간 포스터화·파도 비틀기를 덧씌울 수도 있습니다. ' +
      '만든 효과는 프리셋에 함께 저장되어, 내보내면 받은 사람 화면에서도 똑같이 움직입니다.'
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
    body: '캔버스 위 도구로 텍스트·이미지·순위·도형을 놓습니다. 순위는 “등수 하나”로 1·2·3등을 따로 둘 수 있어 등수마다 다른 효과를 줄 수 있습니다. 아래 효과 라이브러리의 “특이 효과” 칸에서는 🚂 기차처럼 데이터를 태워 나르는 요소를 끌어다 놓습니다.'
  },
  {
    step: '3',
    title: '데이터 꽂기',
    body:
      '아래 “데이터 필드” 탭에서 값을 끌어다 놓으면 그 자리에 들어갑니다. 텍스트 안에 섞어 ' +
      '“오늘의 수다왕은 OOO님!” 처럼 쓸 수도 있습니다. ' +
      '“날짜·시각” 칸에는 오늘 날짜와 지금 시각이 있어 “2026년 7월 26일 방송” 같은 문구를 만들 수 있습니다.'
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
      '요소 하나가 나타나는 순간 울리는 소리는 속성 패널의 “효과” 칸 맨 아래 ' +
      '“등장 효과음”에 있습니다 — 묶음에 걸면 덩어리가 나타날 때 한 번만 울립니다. ' +
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
