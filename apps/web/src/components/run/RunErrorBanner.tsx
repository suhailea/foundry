import { AlertCircle } from 'lucide-react';

interface RunErrorBannerProps {
  reason: string;
}

export function RunErrorBanner({ reason }: RunErrorBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Run failed</p>
        <p className="text-red-600">{reason}</p>
      </div>
    </div>
  );
}
