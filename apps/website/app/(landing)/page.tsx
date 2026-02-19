import type { Metadata } from 'next'
import Link from 'next/link'
import { PairLogo } from '@pair/brand'
import { ThemeToggle } from './theme-toggle'

export const metadata: Metadata = {
  title: 'pair — Code is the easy part.',
  description:
    'pair enables seamless dev-AI collaboration throughout the product lifecycle. Process layer for AI coding tools.',
  openGraph: {
    title: 'pair — Code is the easy part.',
    description: 'pair enables seamless dev-AI collaboration throughout the product lifecycle.',
    type: 'website',
  },
}

const PAIN_POINTS = [
  {
    question: 'Who owns the process when AI writes the code?',
    detail: 'AI generates code fast — but without process, you ship debt faster.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z'
        />
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M16.5 13.5v3.75m0 0v3m0-3h3m-3 0h-3'
        />
      </svg>
    ),
  },
  {
    question: 'How do you keep quality consistent across AI-assisted sprints?',
    detail: 'Different prompts, different outputs. No shared standards, no consistency.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z'
        />
      </svg>
    ),
  },
  {
    question: 'Where do architectural decisions live when agents switch context?',
    detail: 'Decisions are lost between sessions. Every new prompt starts from zero.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z'
        />
      </svg>
    ),
  },
  {
    question: 'How does your team scale AI collaboration without chaos?',
    detail: 'One dev uses Cursor, another uses Copilot. No shared conventions.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z'
        />
      </svg>
    ),
  },
]

/* ── Tool logos (inline SVG paths from simple-icons / lobehub-icons) ── */
const TOOL_LOGOS: Record<string, React.ReactNode> = {
  'Claude Code': (
    <svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5'>
      <path d='M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z' />
    </svg>
  ),
  Cursor: (
    <svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5'>
      <path d='M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23' />
    </svg>
  ),
  'VS Code Copilot': (
    <svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5'>
      <path d='M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z' />
    </svg>
  ),
  Windsurf: (
    <svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5'>
      <path d='M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z' />
    </svg>
  ),
  Codex: (
    <svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5'>
      <path d='M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z' />
    </svg>
  ),
}

const TOOLS = [
  { name: 'Claude Code' },
  { name: 'Cursor' },
  { name: 'VS Code Copilot' },
  { name: 'Windsurf' },
  { name: 'Codex' },
]

const AUDIENCE_TRACKS = [
  {
    audience: 'Solo Dev',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-7 w-7'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
        />
      </svg>
    ),
    pain: 'AI writes code fast, but your project has no structure, no tests, no process.',
    solution:
      'pair bootstraps your project with guidelines, skills, and quality gates — so AI follows your standards from day one.',
    cta: 'Get started',
    href: '/docs',
  },
  {
    audience: 'Team',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-7 w-7'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'
        />
      </svg>
    ),
    pain: 'Every team member uses AI differently. No shared conventions, inconsistent output.',
    solution:
      'pair provides a shared knowledge base that every AI assistant reads — same guidelines, same quality, regardless of the tool.',
    cta: 'Set up for your team',
    href: '/docs/customization/team',
  },
  {
    audience: 'Organization',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-7 w-7'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'
        />
      </svg>
    ),
    pain: 'Scaling AI adoption across teams without governance is a recipe for technical debt.',
    solution:
      'pair lets you publish and distribute organizational standards as a knowledge base — version, govern, and evolve.',
    cta: 'Enterprise rollout',
    href: '/docs/customization/organization',
  },
]

const PHASES = [
  {
    step: '01',
    name: 'Bootstrap',
    description: 'Define your project: PRD, tech stack, quality gates.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-5 w-5'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z'
        />
      </svg>
    ),
  },
  {
    step: '02',
    name: 'Plan',
    description: 'Break work into initiatives, epics, stories, and tasks.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-5 w-5'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z'
        />
      </svg>
    ),
  },
  {
    step: '03',
    name: 'Implement',
    description: 'AI follows your guidelines. TDD, quality checks, adoption compliance.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-5 w-5'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5'
        />
      </svg>
    ),
  },
  {
    step: '04',
    name: 'Review',
    description: 'Structured code review against your standards. Merge with confidence.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-5 w-5'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
        />
      </svg>
    ),
  },
]

const FEATURES = [
  {
    name: 'Skills',
    description: 'Reusable, composable process skills that any AI assistant can execute.',
    accent: 'from-pair-blue to-blue-400',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z'
        />
      </svg>
    ),
  },
  {
    name: 'Knowledge Base',
    description: 'Guidelines, templates, and standards your AI reads automatically.',
    accent: 'from-pair-teal to-cyan-400',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
        />
      </svg>
    ),
  },
  {
    name: 'Adoption Files',
    description: 'Tech decisions, architecture, and way-of-working — versioned and enforced.',
    accent: 'from-blue-400 to-pair-teal',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75'
        />
      </svg>
    ),
  },
  {
    name: 'Agent Integration',
    description: 'Works with Claude Code, Cursor, Copilot, Windsurf, and Codex.',
    accent: 'from-pair-blue to-pair-teal',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        className='h-6 w-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
        />
      </svg>
    ),
  },
]

export default function HomePage() {
  return (
    <main className='min-h-screen bg-pair-bg-light text-pair-text-light dark:bg-pair-bg-dark dark:text-pair-text-dark'>
      <ThemeToggle />
      <HeroSection />
      <div className='gradient-line mx-auto max-w-4xl' />
      <PainPointsSection />
      <WorksWithSection />
      <DemoPlaceholderSection />
      <AudienceTracksSection />
      <HowItWorksSection />
      <FeaturesSection />
      <OpenSourceSection />
      <CTASection />
    </main>
  )
}

function HeroSection() {
  return (
    <section
      aria-label='Hero'
      className='relative flex flex-col items-center overflow-hidden px-6 pb-20 pt-28 text-center md:pb-28 md:pt-36'>
      <div className='hero-glow animate-float' />
      <PairLogo variant='full' animate size={120} className='relative z-10 mb-10' />
      <h1 className='relative z-10 font-sans text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl'>
        Code is the <span className='gradient-text'>easy part.</span>
      </h1>
      <p className='relative z-10 mt-6 max-w-2xl text-lg text-pair-text-muted-light dark:text-pair-text-muted-dark md:text-xl'>
        <strong className='text-pair-text-light dark:text-pair-text-dark'>pair</strong> is the
        process layer for AI-assisted development.
        <br />
        It gives your AI assistant the context, guidelines, and skills to
      </p>
      <p className='relative z-10 mt-2 text-xl font-bold md:text-2xl'>
        <span className='gradient-text'>work the way your team works.</span>
      </p>
      <div className='relative z-10 mt-10'>
        <a
          href='https://github.com/foomakers/pair/releases/latest'
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-[48px] items-center justify-center rounded-xl bg-pair-blue px-10 py-3 text-base font-semibold text-white shadow-lg shadow-pair-blue/25 transition-all duration-300 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
          Get pair
        </a>
      </div>
    </section>
  )
}

function PainPointsSection() {
  return (
    <section aria-label='Pain points' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-5xl'>
        <h2 className='mb-4 text-center font-sans text-2xl font-extrabold md:text-3xl'>
          <span className='gradient-text'>Sound familiar?</span>
        </h2>
        <p className='mx-auto mb-12 max-w-md text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          These are the questions every team hits when AI enters the workflow.
        </p>
        <div className='grid gap-6 md:grid-cols-2'>
          {PAIN_POINTS.map(point => (
            <div
              key={point.question}
              className='card-glow gradient-border rounded-2xl bg-pair-bg-light p-6 dark:bg-pair-bg-dark'>
              <div className='mb-3 text-pair-blue'>{point.icon}</div>
              <p className='mb-2 font-sans text-lg font-bold text-pair-text-light dark:text-pair-text-dark'>
                {point.question}
              </p>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {point.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorksWithSection() {
  return (
    <section
      aria-label='Works with'
      className='border-y border-pair-border-light px-6 py-12 dark:border-pair-border-dark'>
      <p className='mb-8 text-center text-sm font-medium uppercase tracking-widest text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Works with
      </p>
      <div className='flex flex-wrap items-center justify-center gap-10 md:gap-14'>
        {TOOLS.map(tool => (
          <span
            key={tool.name}
            className='flex items-center gap-2.5 text-pair-text-muted-light transition-colors duration-200 hover:text-pair-text-light dark:text-pair-text-muted-dark dark:hover:text-pair-text-dark'
            role='img'
            aria-label={`${tool.name} logo`}>
            {TOOL_LOGOS[tool.name]}
            <span className='font-mono text-sm font-medium'>{tool.name}</span>
          </span>
        ))}
      </div>
    </section>
  )
}

function DemoPlaceholderSection() {
  return (
    <section aria-label='Demo' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-4xl'>
        <div className='asset-placeholder h-80 rounded-2xl bg-pair-border-light dark:bg-pair-border-dark'>
          <span className='opacity-60'>[ demo video / terminal animation placeholder ]</span>
        </div>
      </div>
    </section>
  )
}

function AudienceTracksSection() {
  return (
    <section aria-label='Audience tracks' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          Built for <span className='gradient-text'>every scale</span>
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Whether you work alone, with a team, or across an organization — pair adapts to your
          workflow.
        </p>
        <div className='grid gap-8 md:grid-cols-3'>
          {AUDIENCE_TRACKS.map(track => (
            <div
              key={track.audience}
              className='card-glow group flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <div className='mb-4 text-pair-blue'>{track.icon}</div>
              <h3 className='mb-3 font-sans text-xl font-bold'>{track.audience}</h3>
              <p className='mb-4 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {track.pain}
              </p>
              <p className='mb-8 flex-1 text-sm'>{track.solution}</p>
              <Link
                href={track.href}
                className='gradient-border inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 hover:bg-slate-50 group-hover:shadow-md dark:hover:bg-slate-900'>
                {track.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section aria-label='How it works' className='relative overflow-hidden px-6 py-20 md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light via-pair-bg-light to-pair-border-light dark:from-pair-border-dark dark:via-pair-bg-dark dark:to-pair-border-dark' />
      <div className='relative mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          How it works
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Four phases. One continuous process. From idea to production.
        </p>
        <div className='grid gap-6 md:grid-cols-4'>
          {PHASES.map((phase, i) => (
            <div
              key={phase.name}
              className={`card-glow relative flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-6 dark:border-pair-border-dark dark:bg-pair-bg-dark ${i < PHASES.length - 1 ? 'phase-connector' : ''}`}>
              <span className='mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pair-blue to-pair-teal font-mono text-sm font-bold text-white'>
                {phase.step}
              </span>
              <h3 className='mb-1 font-sans text-lg font-bold'>{phase.name}</h3>
              <div className='mb-2 text-pair-teal'>{phase.icon}</div>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {phase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
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

function OpenSourceSection() {
  return (
    <section
      aria-label='Open source'
      className='border-t border-pair-border-light px-6 py-20 text-center dark:border-pair-border-dark'>
      <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-4xl'>Open Source</h2>
      <p className='mb-8 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        pair is free, open source, and community-driven.
      </p>
      <a
        href='https://github.com/foomakers/pair'
        target='_blank'
        rel='noopener noreferrer'
        className='gradient-border inline-flex min-h-[48px] items-center gap-3 rounded-xl px-6 py-3 font-semibold transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900'
        aria-label='View pair on GitHub'>
        <svg width='22' height='22' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
          <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' />
        </svg>
        foomakers/pair
      </a>
    </section>
  )
}

function CTASection() {
  return (
    <section
      aria-label='Call to action'
      className='relative overflow-hidden px-6 py-20 text-center md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light to-pair-bg-light dark:from-pair-border-dark dark:to-pair-bg-dark' />
      <div className='relative'>
        <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-5xl'>
          Ready to <span className='gradient-text'>start?</span>
        </h2>
        <p className='mb-10 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Add pair to your project in under a minute.
        </p>
        <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
          <a
            href='https://github.com/foomakers/pair/releases/latest'
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl bg-pair-blue px-8 py-3 text-base font-semibold text-white shadow-lg shadow-pair-blue/25 transition-all duration-300 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
            Get pair
          </a>
          <Link
            href='/docs'
            className='gradient-border inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base font-semibold transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900'>
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  )
}
