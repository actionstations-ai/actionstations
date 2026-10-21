import type { ProviderRouting } from '@shared/schemas'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'

export function useSaveRouting(scope: 'global' | 'project', projectPath?: string) {
  const mutation = useIpcMutation('routing:set', { invalidates: ['routing:get'] })
  const save = (routing: ProviderRouting) =>
    mutation.mutate(
      { scope, routing, ...(projectPath ? { projectPath } : {}) },
      {
        onSuccess: () => toast.success('Routing saved'),
        onError: (err) => toast.error('Could not save routing', err),
      },
    )
  return { save, saving: mutation.isPending }
}
