import { useEffect, useRef, useState } from 'react'
import { audioOf, type AudioClip, type Deck, type DeckAudio, type Slide } from '@shared/deck'
import {
  builtinAudioUrl,
  builtinNameOf,
  BUILTIN_BGM,
  BUILTIN_SOUNDS,
  type BuiltinAudio
} from '@shared/builtin-audio'
import { CheckBox, Field, NumberInput, Select, Slider } from './Controls'

/**
 * 소리 서랍 — 배경음악 하나와, 장마다의 효과음.
 *
 * ## OBS 로 소리를 보내려면
 * 브라우저 소스 속성에서 **"OBS 를 통해 오디오 제어"** 를 켜야 소리가 방송에 실린다.
 * 안 켜면 스트리머 스피커에서만 나고 시청자는 못 듣는다 — 가장 흔한 함정이라 화면에 적어둔다.
 *
 * ## 기본 소리는 왜 합성인가
 * 무료 효과음 사이트 대부분이 "상업적 이용은 무료지만 **재배포 금지**"다. 이 앱은 프리셋을
 * 남에게 주는 것이 핵심이라 남의 음원을 기본값으로 넣을 수 없다. 직접 만든 소리라면
 * 프리셋에 담아 공유해도 아무 문제가 없다. 물론 사용자가 직접 받아 쓰는 건 자유다.
 */

function fileNameOf(src: string): string {
  const builtin = builtinNameOf(src)
  if (builtin) return builtin
  const m = /\/user-assets\/([^/?#]+)$/.exec(src)
  try {
    return m ? decodeURIComponent(m[1]) : src
  } catch {
    return m ? m[1] : src
  }
}

/** 고른 소리를 그 자리에서 들어보는 작은 재생기. */
function TryButton({ clip }: { clip: AudioClip | null }): React.JSX.Element {
  const elRef = useRef<HTMLAudioElement | null>(null)
  const [on, setOn] = useState(false)

  useEffect(
    () => () => {
      elRef.current?.pause()
      elRef.current = null
    },
    []
  )

  function toggle(): void {
    if (on) {
      elRef.current?.pause()
      elRef.current = null
      setOn(false)
      return
    }
    if (!clip?.src) return
    const el = new Audio(clip.src)
    el.volume = Math.max(0, Math.min(1, clip.volume / 100))
    el.onended = () => setOn(false)
    void el.play().catch(() => setOn(false))
    elRef.current = el
    setOn(true)
  }

  return (
    <button disabled={!clip?.src} onClick={toggle} title="여기서만 들어봅니다 (방송에 나가지 않음)">
      {on ? '■ 정지' : '▶ 들어보기'}
    </button>
  )
}

function ClipRow({
  clip,
  onChange,
  emptyLabel,
  presets,
  defaultVolume
}: {
  clip: AudioClip | null
  onChange: (next: AudioClip | null) => void
  emptyLabel: string
  /** 앱이 기본으로 들고 있는 소리들 */
  presets: BuiltinAudio[]
  defaultVolume: number
}): React.JSX.Element {
  async function pick(): Promise<void> {
    const asset = await window.endcredit.assets.pickAudio()
    if (asset) onChange({ src: asset.url, volume: clip?.volume ?? defaultVolume })
  }

  // 목록에서 고른 값이 지금 소리와 같은지 — 내 파일이면 빈 값으로 둔다
  const chosen = presets.find((b) => clip?.src === builtinAudioUrl(b.id))?.id ?? ''

  return (
    <>
      <div className="au-pick">
        <Select
          value={chosen}
          onChange={(id) =>
            onChange(
              id === ''
                ? null
                : { src: builtinAudioUrl(id), volume: clip?.volume ?? defaultVolume }
            )
          }
          options={[
            { value: '', label: clip?.src && !chosen ? '내 파일 사용 중' : emptyLabel },
            ...presets.map((b) => ({ value: b.id, label: `${b.name} — ${b.hint}` }))
          ]}
        />
      </div>

      <div className="au-file">
        {clip?.src ? (
          <span className="au-name" title={clip.src}>
            {fileNameOf(clip.src)}
          </span>
        ) : (
          <span className="au-none">{emptyLabel}</span>
        )}
        <div className="spacer" />
        <TryButton clip={clip} />
        <button onClick={() => void pick()} title="내 컴퓨터의 소리 파일">
          내 파일…
        </button>
        {clip?.src && (
          <button className="au-clear" title="제거" onClick={() => onChange(null)}>
            ✕
          </button>
        )}
      </div>

      {clip?.src && (
        <Field label="음량">
          <Slider
            value={clip.volume}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => onChange({ ...clip, volume: v })}
          />
        </Field>
      )}
    </>
  )
}

export function AudioPanel({
  deck,
  slide,
  slideName,
  onDeckAudio,
  onSlideSound
}: {
  deck: Deck
  slide: Slide
  slideName: string
  onDeckAudio: (a: DeckAudio) => void
  onSlideSound: (c: AudioClip | null) => void
}): React.JSX.Element {
  const a = audioOf(deck)
  const withSound = deck.slides.filter((s) => s.sound?.src).length

  return (
    <div className="au">
      <section className="au-sec">
        <h4>배경음악 <em>크레딧 전체</em></h4>
        <ClipRow
          clip={a.bgm}
          emptyLabel="배경음악 없음"
          presets={BUILTIN_BGM}
          defaultVolume={55}
          onChange={(bgm) => onDeckAudio({ ...a, bgm })}
        />
        {a.bgm?.src && (
          <div className="au-grid">
            <Field label="페이드 인">
              <NumberInput
                value={a.fadeInMs}
                min={0}
                max={10000}
                step={100}
                suffix="ms"
                onChange={(v) => onDeckAudio({ ...a, fadeInMs: v })}
              />
            </Field>
            <Field label="페이드 아웃">
              <NumberInput
                value={a.fadeOutMs}
                min={0}
                max={10000}
                step={100}
                suffix="ms"
                onChange={(v) => onDeckAudio({ ...a, fadeOutMs: v })}
              />
            </Field>
            <CheckBox
              label="크레딧이 더 길면 반복"
              checked={a.loop}
              onChange={(v) => onDeckAudio({ ...a, loop: v })}
            />
          </div>
        )}
      </section>

      <section className="au-sec">
        <h4>
          효과음 <em>{slideName} · 이 장이 나올 때 한 번</em>
        </h4>
        <ClipRow
          clip={slide.sound ?? null}
          emptyLabel="효과음 없음"
          presets={BUILTIN_SOUNDS}
          defaultVolume={85}
          onChange={onSlideSound}
        />
        {withSound > 0 && (
          <p className="au-tip">효과음이 걸린 장: {withSound}개</p>
        )}
      </section>

      <section className="au-sec au-help">
        <h4>OBS 에서 소리가 안 들린다면</h4>
        <p>
          브라우저 소스 속성에서 <b>“OBS를 통해 오디오 제어”</b> 를 켜세요. 꺼져 있으면 내
          스피커에서만 나고 <b>시청자에게는 들리지 않습니다.</b>
        </p>
        <p className="au-dim">
          켜고 나면 OBS 오디오 믹서에 소스가 나타납니다 — 거기서 음량을 마지막으로 맞추세요.
        </p>
      </section>

      <section className="au-sec">
        <h4>소리 더 구하기</h4>
        <p className="au-tip">
          목록에 있는 소리는 이 앱이 직접 만든 것이라 프리셋에 담아 나눠줘도 괜찮습니다.
          더 좋은 소리가 필요하면 무료 사이트에서 받아 <b>내 파일…</b> 로 넣으세요.
        </p>
        <div className="au-links">
          <button onClick={() => window.endcredit.app.openUrl('https://soundeffect-lab.info/sound/anime/')}>
            효과음 라보 ↗
          </button>
          <button onClick={() => window.endcredit.app.openUrl('https://dova-s.jp/')}>
            DOVA-SYNDROME (BGM) ↗
          </button>
        </div>
        <p className="au-dim">
          받은 파일을 방송에 쓰는 건 대개 자유지만, <b>프리셋에 담아 남에게 주는 건 재배포</b>라
          금지인 곳이 많습니다. 공유할 프리셋이면 위 기본 소리를 쓰세요.
        </p>
      </section>
    </div>
  )
}
