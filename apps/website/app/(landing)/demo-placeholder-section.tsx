export function DemoPlaceholderSection() {
  return (
    <section aria-label='Demo' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-4xl'>
        <div
          className='asset-placeholder h-80 rounded-2xl bg-pair-border-light dark:bg-pair-border-dark flex items-center justify-center'
          role='img'
          aria-label='Demo video placeholder'>
          <span className='text-pair-text-muted-light dark:text-pair-text-muted-dark text-sm'>
            [ demo placeholder ]
          </span>
        </div>
      </div>
    </section>
  )
}
