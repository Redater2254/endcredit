/**
 * 이 컴퓨터에 실제로 깔린 글꼴 고르기.
 *
 * 브라우저에는 "설치된 글꼴 목록"을 주는 API 가 사실상 없다(Local Font Access 는 권한이
 * 필요하고 OBS 쪽에서도 못 믿는다). 그래서 **후보를 정해두고 하나씩 재본다** —
 * 없는 글꼴을 지정하면 브라우저가 대체 글꼴로 그리므로, 대체 글꼴과 글자 폭이 같으면
 * 그 글꼴은 없는 것이다.
 *
 * 후보에 없는 글꼴은 직접 입력해서 쓸 수 있다. 목록은 고르기 쉬우라고 있는 것이지
 * 제한이 아니다.
 */

export interface FontChoice {
  /** CSS font-family 값 */
  family: string
  /** 목록에 보일 이름 */
  label: string
}

/**
 * 한국 스트리머 컴퓨터에 있을 법한 것들.
 * 윈도우 기본 + 무료 배포로 널리 깔린 것 + 서양식 기본.
 */
const CANDIDATES: FontChoice[] = [
  // 윈도우 기본
  { family: '"Malgun Gothic"', label: '맑은 고딕' },
  { family: '"Gulim"', label: '굴림' },
  { family: '"Dotum"', label: '돋움' },
  { family: '"Batang"', label: '바탕' },
  { family: '"Gungsuh"', label: '궁서' },
  { family: '"NanumGothic", "나눔고딕"', label: '나눔고딕' },
  { family: '"NanumBarunGothic", "나눔바른고딕"', label: '나눔바른고딕' },
  { family: '"NanumSquare", "나눔스퀘어"', label: '나눔스퀘어' },
  { family: '"NanumSquareRound"', label: '나눔스퀘어라운드' },
  { family: '"NanumMyeongjo", "나눔명조"', label: '나눔명조' },
  { family: '"NanumPen Script", "나눔손글씨 펜"', label: '나눔손글씨 펜' },
  // 자주 쓰이는 무료 배포 글꼴
  { family: 'Pretendard', label: 'Pretendard' },
  { family: '"Noto Sans KR"', label: '본고딕 (Noto Sans KR)' },
  { family: '"Noto Serif KR"', label: '본명조 (Noto Serif KR)' },
  { family: '"Spoqa Han Sans Neo"', label: '스포카 한 산스' },
  { family: '"S-Core Dream", "에스코어드림"', label: '에스코어 드림' },
  { family: '"GmarketSans", "지마켓 산스"', label: 'G마켓 산스' },
  { family: '"BMJUA", "배달의민족 주아"', label: '배민 주아' },
  { family: '"BMDOHYEON", "배달의민족 도현"', label: '배민 도현' },
  { family: '"BMHANNA_11yrs_ttf", "배달의민족 한나는 열한살"', label: '배민 한나' },
  { family: '"TmonMonsori", "티몬 몬소리"', label: '티몬 몬소리' },
  { family: '"Cafe24Ssurround"', label: 'Cafe24 써라운드' },
  { family: '"Cafe24Oneprettynight"', label: 'Cafe24 아네모네' },
  { family: '"yg-jalnan", "여기어때 잘난체"', label: '여기어때 잘난체' },
  { family: '"HSSanTokki20-Regular"', label: 'HS 산토끼' },
  { family: '"KoPubWorldDotum"', label: 'KoPub 돋움' },
  { family: '"Hahmlet"', label: 'Hahmlet' },
  { family: '"IBM Plex Sans KR"', label: 'IBM Plex Sans KR' },
  // 서양식
  { family: 'Arial', label: 'Arial' },
  { family: '"Segoe UI"', label: 'Segoe UI' },
  { family: '"Times New Roman"', label: 'Times New Roman' },
  { family: 'Georgia', label: 'Georgia' },
  { family: '"Trebuchet MS"', label: 'Trebuchet MS' },
  { family: 'Verdana', label: 'Verdana' },
  { family: 'Impact', label: 'Impact' },
  { family: '"Comic Sans MS"', label: 'Comic Sans MS' },
  { family: '"Courier New"', label: 'Courier New' },
  { family: 'Consolas', label: 'Consolas' }
]

/** 어느 대체 글꼴로 떨어지든 잡아내려면 계열이 다른 셋을 다 봐야 한다. */
const BASES = ['monospace', 'sans-serif', 'serif']
/** 한글·영문·숫자를 섞어야 한쪽만 다른 글꼴도 걸린다 */
const PROBE = '가나다라A B Cwiil1임'

let cached: FontChoice[] | null = null

function installed(family: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return true // 잴 수 없으면 막지 않는다

  for (const base of BASES) {
    ctx.font = `72px ${base}`
    const fallbackWidth = ctx.measureText(PROBE).width
    ctx.font = `72px ${family}, ${base}`
    if (ctx.measureText(PROBE).width !== fallbackWidth) return true
  }
  return false
}

/**
 * 고를 수 있는 글꼴들. 한 번 재고 캐시한다 — 후보 40개 × 3계열을 매번 재면 눈에 띄게 느리다.
 * 첫 항목은 항상 "문서 기본"이라, 요소별 지정을 지우는 길이 된다.
 */
export function availableFonts(): FontChoice[] {
  cached ??= CANDIDATES.filter((f) => installed(f.family))
  return cached
}
