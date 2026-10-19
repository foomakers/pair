const DEMO_ALT = 'pair demo: a terminal running pair skills through an AI coding assistant'

export function DemoSection() {
  return (
    <section aria-label='Demo' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-4xl'>
        <h2 className='sr-only'>Demo</h2>
        <div className='relative aspect-video overflow-hidden rounded-2xl bg-[#0a0d14]'>
          {/* Video: hidden when prefers-reduced-motion */}
          <video
            className='demo-video h-full w-full object-contain'
            src='/demo.mp4'
            poster='/demo-poster.png'
            autoPlay
            muted
            loop
            playsInline
            aria-label={DEMO_ALT}
          />
          {/* Static fallback: shown only when prefers-reduced-motion */}
          <img
            className='demo-poster absolute inset-0 hidden h-full w-full object-contain'
            src='/demo-poster.png'
            alt={DEMO_ALT}
          />
        </div>
      </div>
    </section>
  )
}
