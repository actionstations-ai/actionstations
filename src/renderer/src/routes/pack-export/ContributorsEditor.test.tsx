// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ContributorsEditor } from './ContributorsEditor'
import type { ContributorDraft } from './wizard-model'

function Harness({ onList }: { onList: (l: ContributorDraft[]) => void }) {
  const [list, setList] = useState<ContributorDraft[]>([])
  return (
    <ContributorsEditor
      contributors={list}
      onChange={(next) => {
        setList(next)
        onList(next)
      }}
    />
  )
}

afterEach(cleanup)

describe('ContributorsEditor', () => {
  it('adds a contributor with a name, a GitHub user and roles, then removes it', async () => {
    const user = userEvent.setup()
    let last: ContributorDraft[] = []
    render(<Harness onList={(l) => (last = l)} />)
    await user.click(screen.getByRole('button', { name: 'Add a contributor' }))
    await user.type(screen.getByLabelText('Name'), 'Riverton Translators')
    await user.type(screen.getByLabelText('GitHub user'), 'riverton-tr')
    await user.click(screen.getByRole('checkbox', { name: 'translation' }))
    await user.click(screen.getByRole('checkbox', { name: 'review' }))
    expect(last).toEqual([
      {
        name: 'Riverton Translators',
        url: '',
        github: 'riverton-tr',
        roles: ['translation', 'review'],
      },
    ])
    await user.click(screen.getByRole('button', { name: 'Remove contributor 1' }))
    expect(last).toEqual([])
  })
})
