/**
 * 지금 사용자가 **글자를 치는 중**인지.
 *
 * 단축키를 가로챌지 말지 가르는 기준이다. 예전에는 `INPUT` 이면 전부 비켜줬는데,
 * 슬라이더(`input[type=range]`)와 체크상자도 `INPUT` 이라 문제가 생겼다 —
 * 길이 슬라이더를 만진 뒤 스페이스를 누르면 초점이 거기 남아 있어서
 * **브라우저가 슬라이더를 한 번 더 눌러버리고**, 재생·멈춤은 되지 않았다.
 *
 * 글자를 받는 칸만 비켜주고 나머지는 우리가 가져가면(그리고 기본 동작을 막으면)
 * 초점이 어디에 있든 단축키가 똑같이 동작한다.
 */
const TEXT_TYPES = new Set([
  'text',
  'number',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'date',
  'time',
  ''
])

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  return TEXT_TYPES.has((el as HTMLInputElement).type)
}
