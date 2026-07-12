import { Card, AnthropicLogo, CursorLogo, CopilotLogo, WindsurfLogo, OpenAILogo } from '$components'
import { Section } from './primitives'

export function ToolLogosSection() {
  const logos = [
    { name: 'Anthropic', Logo: AnthropicLogo },
    { name: 'Cursor', Logo: CursorLogo },
    { name: 'Copilot', Logo: CopilotLogo },
    { name: 'Windsurf', Logo: WindsurfLogo },
    { name: 'OpenAI', Logo: OpenAILogo },
  ]
  return (
    <Section title='Tool Logos (5)'>
      <Card>
        <div
          style={{
            display: 'flex',
            gap: '3rem',
            alignItems: 'center',
            justifyContent: 'space-around',
            flexWrap: 'wrap',
          }}>
          {logos.map(({ name, Logo }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <Logo style={{ width: 32, height: 32, margin: '0 auto' }} />
              <p
                style={{
                  fontSize: '0.75rem',
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
