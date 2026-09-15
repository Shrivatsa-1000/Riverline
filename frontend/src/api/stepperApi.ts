import { getApiBaseUrl } from './apiBaseUrl';
import { httpJson } from './httpJson';
import type { StepItem, StepStatus, StepperConfig } from '../types/dashboard';

const emptyStepperConfig: StepperConfig = {
  steps: []
};

function normalizeStatus(value: unknown): StepStatus {
  if (value === 'active' || value === 'completed' || value === 'pending') {
    return value;
  }

  return 'pending';
}

function normalizeObjectSteps(steps: unknown[]): StepItem[] {
  return steps.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return {
        id: index + 1,
        title: `Step ${index + 1}`,
        status: 'pending'
      };
    }

    const step = entry as { id?: unknown; title?: unknown; status?: unknown };

    const id = Number(step.id ?? index + 1);
    const safeId = Number.isFinite(id) ? id : index + 1;

    return {
      id: safeId,
      title: typeof step.title === 'string' && step.title.trim() ? step.title : `Step ${index + 1}`,
      status: normalizeStatus(step.status)
    };
  });
}

function normalizeStringSteps(payload: {
  steps: string[];
  activeStep?: unknown;
  completedSteps?: unknown;
}): StepItem[] {
  const activeStep = Number(payload.activeStep ?? 1);
  const safeActiveStep = Number.isFinite(activeStep) ? activeStep : 1;

  const completedSteps = Array.isArray(payload.completedSteps)
    ? payload.completedSteps
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : [];

  const completedSet = new Set<number>(completedSteps);

  return payload.steps.map((title, index) => {
    const id = index + 1;

    let status: StepStatus = 'pending';

    if (completedSet.has(id)) {
      status = 'completed';
    } else if (id === safeActiveStep) {
      status = 'active';
    }

    return { id, title, status };
  });
}

function normalizeStepperConfig(data: unknown): StepperConfig {
  if (!data || typeof data !== 'object') {
    return emptyStepperConfig;
  }

  const payload = data as {
    steps?: unknown;
    activeStep?: unknown;
    completedSteps?: unknown;
  };

  if (!Array.isArray(payload.steps)) {
    return emptyStepperConfig;
  }

  if (payload.steps.length > 0 && typeof payload.steps[0] === 'string') {
    return {
      steps: normalizeStringSteps({
        steps: payload.steps as string[],
        activeStep: payload.activeStep,
        completedSteps: payload.completedSteps
      })
    };
  }

  return {
    steps: normalizeObjectSteps(payload.steps)
  };
}

export async function fetchStepperConfig(userName?: string): Promise<StepperConfig> {
  try {
    const query = new URLSearchParams();

    if (userName && userName.trim()) {
      query.set('userName', userName.trim());
    }

    const queryString = query.toString();
    const url = `${getApiBaseUrl()}/api/stepper${queryString ? `?${queryString}` : ''}`;

    const data = await httpJson<unknown>(url, undefined, {
      fallbackError: 'Unable to load stepper config'
    });

    return normalizeStepperConfig(data);
  } catch {
    return emptyStepperConfig;
  }
}
