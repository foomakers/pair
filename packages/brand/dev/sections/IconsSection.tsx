import {
  Card,
  GridPlusIcon,
  ShieldCheckIcon,
  FolderIcon,
  UsersIcon,
  TerminalIcon,
  TeamIcon,
  BuildingIcon,
  RocketIcon,
  MapIcon,
  CodeIcon,
  CheckCircleIcon,
  BoltIcon,
  BookIcon,
  SlidersIcon,
  LinkIcon,
  GitHubIcon,
} from '$components'
import { Section } from './primitives'

export function IconsSection() {
  const icons = [
    { name: 'GridPlusIcon', Icon: GridPlusIcon },
    { name: 'ShieldCheckIcon', Icon: ShieldCheckIcon },
    { name: 'FolderIcon', Icon: FolderIcon },
    { name: 'UsersIcon', Icon: UsersIcon },
    { name: 'TerminalIcon', Icon: TerminalIcon },
    { name: 'TeamIcon', Icon: TeamIcon },
    { name: 'BuildingIcon', Icon: BuildingIcon },
    { name: 'RocketIcon', Icon: RocketIcon },
    { name: 'MapIcon', Icon: MapIcon },
    { name: 'CodeIcon', Icon: CodeIcon },
    { name: 'CheckCircleIcon', Icon: CheckCircleIcon },
    { name: 'BoltIcon', Icon: BoltIcon },
    { name: 'BookIcon', Icon: BookIcon },
    { name: 'SlidersIcon', Icon: SlidersIcon },
    { name: 'LinkIcon', Icon: LinkIcon },
    { name: 'GitHubIcon', Icon: GitHubIcon },
  ]
  return (
    <Section title='Icons (16)'>
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '1.5rem',
          }}>
          {icons.map(({ name, Icon }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <Icon style={{ width: 28, height: 28, margin: '0 auto' }} />
              <p
                style={{
                  fontSize: '0.7rem',
                  marginTop: '0.4rem',
                  color: 'var(--pair-text-muted)',
                }}>
                {name}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  )
}
