import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code2, Link2, Unlink } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.js';
import { useIntegrations } from '../hooks/use-integrations.js';
import { disconnectIntegration } from '../lib/api.js';
import { getToken } from '../lib/auth.js';

const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access repositories, pull requests, and issues.',
    icon: Code2,
  },
];

export function IntegrationsView() {
  const { data: integrations, isLoading } = useIntegrations();
  const queryClient = useQueryClient();

  const disconnect = useMutation({
    mutationFn: disconnectIntegration,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const connectedProviders = new Set(integrations?.map((i) => i.provider) ?? []);

  const handleConnect = (provider: string) => {
    const token = getToken();
    window.location.href = `/v1/integrations/${provider}/connect?token=${token}`;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 items-center border-b border-gray-100 px-6">
        <h1 className="text-sm font-semibold text-gray-900">Integrations</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-6 text-sm text-gray-500">
          Connect your tools so Foundry can act on your behalf.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {PROVIDERS.map(({ id, name, description, icon: Icon }) => {
              const connected = connectedProviders.has(id);
              const integration = integrations?.find((i) => i.provider === id);

              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100">
                      <Icon className="h-4 w-4 text-gray-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{name}</p>
                        {connected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {connected && integration
                          ? `Connected · ${integration.scope}`
                          : description}
                      </p>
                    </div>
                  </div>

                  {connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnect.mutate(id)}
                      disabled={disconnect.isPending}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleConnect(id)}>
                      <Link2 className="h-3.5 w-3.5" />
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
