export interface NvidiaApiErrorDetails {
  status?: number;
  title?: string;
  detail?: string;
  message?: string;
  code?: string | number;
  suggestedAction?: string;
  raw?: any;
}

export class NvidiaApiError extends Error {
  readonly status: number;
  readonly details: NvidiaApiErrorDetails;

  constructor(message: string, status: number = 500, details: NvidiaApiErrorDetails = {}) {
    super(message);
    this.name = 'NvidiaApiError';
    this.status = status;
    this.details = { ...details, status };
  }

  static parse(responseStatus: number, responseBodyText: string, model?: string): NvidiaApiError {
    let parsed: any = null;
    try {
      parsed = JSON.parse(responseBodyText);
    } catch {
      // Not JSON
    }

    const detailText = parsed?.detail || parsed?.error?.message || responseBodyText || 'Unknown error';
    const titleText = parsed?.title || parsed?.error?.type || '';

    // Diagnose known NVIDIA NIM error patterns
    if (responseStatus === 401 || responseStatus === 403) {
      return new NvidiaApiError(
        'Invalid or expired NVIDIA API Key. Please verify your key on build.nvidia.com.',
        responseStatus,
        {
          title: 'Unauthorized',
          detail: detailText,
          suggestedAction: 'Generate a new API key on build.nvidia.com and update it in Settings.',
          raw: parsed,
        }
      );
    }

    if (responseStatus === 410) {
      return new NvidiaApiError(
        `Model '${model || 'selected'}' has reached end-of-life and is no longer available on NVIDIA NIM.`,
        410,
        {
          title: 'Model Gone (End-of-Life)',
          detail: detailText,
          suggestedAction: 'Select a different model from the NVIDIA Models dropdown or choose Automatic.',
          raw: parsed,
        }
      );
    }

    if (responseStatus === 404) {
      if (detailText.includes('Not found for account') || detailText.includes('Function')) {
        return new NvidiaApiError(
          `NVIDIA Account Entitlement Error: Your NVIDIA account is missing the 'Public API Endpoints' permission for inference with model '${model || 'this model'}'.`,
          404,
          {
            title: 'Account Not Entitled for Model',
            detail: detailText,
            suggestedAction:
              'Contact help@build.nvidia.com to enable Public API Endpoints, or switch to a self-hosted NIM container (http://localhost:8000/v1).',
            raw: parsed,
          }
        );
      }

      return new NvidiaApiError(
        `NVIDIA NIM endpoint or model '${model || ''}' not found.`,
        404,
        {
          title: 'Not Found',
          detail: detailText,
          suggestedAction: 'Verify the Base URL and ensure the selected model exists on this NIM instance.',
          raw: parsed,
        }
      );
    }

    if (responseStatus === 429) {
      return new NvidiaApiError(
        'NVIDIA NIM rate limit or credit quota exceeded.',
        429,
        {
          title: 'Rate Limited',
          detail: detailText,
          suggestedAction: 'Wait a few minutes or upgrade your account tier on build.nvidia.com.',
          raw: parsed,
        }
      );
    }

    return new NvidiaApiError(
      `NVIDIA NIM error (HTTP ${responseStatus}): ${detailText}`,
      responseStatus,
      {
        title: titleText || `HTTP ${responseStatus}`,
        detail: detailText,
        raw: parsed,
      }
    );
  }
}
