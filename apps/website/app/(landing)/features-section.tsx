import { BoltIcon, BookIcon, SlidersIcon, LinkIcon } from './icons'

const FEATURES = [
  {
    name: 'Skills',
    description: 'Reusable, composable process skills that any AI assistant can execute.',
    accent: 'from-pair-blue to-blue-400',
    icon: <BoltIcon className='h-6 w-6' />,
  },
  {
    name: 'Knowledge Base',
    description: 'Guidelines, templates, and standards your AI reads automatically.',
    accent: 'from-pair-teal to-cyan-400',
    icon: <BookIcon className='h-6 w-6' />,
  },
  {
    name: 'Adoption Files',
    description: 'Tech decisions, architecture, and way-of-working — versioned and enforced.',
    accent: 'from-blue-400 to-pair-teal',
    icon: <SlidersIcon className='h-6 w-6' />,
  },
  {
    name: 'Agent Integration',
    description: 'Works with Claude Code, Cursor, Copilot, Windsurf, and Codex.',
    accent: 'from-pair-blue to-pair-teal',
    icon: <LinkIcon className='h-6 w-6' />,
  },
]

export function FeaturesSection() {
  return (
    <section aria-label='Features' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          What you get
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Everything your AI assistant needs to follow your standards.
        </p>
        <div className='grid gap-8 sm:grid-cols-2'>
          {FEATURES.map(feature => (
            <div
              key={feature.name}
              className='card-glow group rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <div className='mb-4 flex items-center gap-3'>
                <div className='text-pair-blue'>{feature.icon}</div>
                <div
                  className={`h-1 w-8 rounded-full bg-gradient-to-r ${feature.accent} transition-all duration-300 group-hover:w-16`}
                />
              </div>
              <h3 className='mb-2 font-sans text-lg font-bold'>{feature.name}</h3>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
