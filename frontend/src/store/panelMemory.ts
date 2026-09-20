import { reactive } from 'vue'
import {
  ALGORITHMS,
  TEST_FUNCTIONS,
  type AlgorithmId,
  type FunctionId,
  type ParamBag,
  defaultBag,
} from '@/types'

const STORAGE_KEY = 'opt-viz-panel-memory-v1'

interface PersistedState {
  algorithm: AlgorithmId
  functionId: FunctionId
  /** 每种算法各自记住上次调好的一整套值 */
  bags: Record<AlgorithmId, ParamBag>
}

function freshState(): PersistedState {
  const algorithm = 'gradient_descent'
  const functionId = 'rosenbrock'
  const bags = {} as Record<AlgorithmId, ParamBag>
  for (const a of ALGORITHMS) {
    bags[a.id as AlgorithmId] = defaultBag(a.id as AlgorithmId, functionId)
  }
  return { algorithm, functionId, bags }
}

/** 老版本数据/缺字段时补齐，并清掉非法类型，保证记忆总是可用 */
function sanitize(raw: unknown): PersistedState {
  const base = freshState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<PersistedState>
  const state: PersistedState = {
    algorithm: base.algorithm,
    functionId: base.functionId,
    bags: base.bags,
  }
  if (typeof r.algorithm === 'string' && ALGORITHMS.some((a) => a.id === r.algorithm)) {
    state.algorithm = r.algorithm as AlgorithmId
  }
  if (typeof r.functionId === 'string' && TEST_FUNCTIONS.some((f) => f.id === r.functionId)) {
    state.functionId = r.functionId as FunctionId
  }
  if (r.bags && typeof r.bags === 'object') {
    for (const a of ALGORITHMS) {
      const id = a.id as AlgorithmId
      const saved = (r.bags as Record<string, unknown>)[id]
      if (saved && typeof saved === 'object') {
        state.bags[id] = mergeBag(defaultBag(id, state.functionId), saved as Record<string, unknown>)
      }
    }
  }
  return state
}

function numOr(v: unknown, fallback: number | null): number | null {
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function mergeBag(dflt: ParamBag, saved: Record<string, unknown>): ParamBag {
  return {
    x0: numOr(saved.x0, dflt.x0),
    y0: numOr(saved.y0, dflt.y0),
    learningRate: numOr(saved.learningRate, dflt.learningRate),
    iterations: numOr(saved.iterations, dflt.iterations),
    momentum: numOr(saved.momentum, dflt.momentum),
    temperature: numOr(saved.temperature, dflt.temperature),
    coolingRate: typeof saved.coolingRate === 'number' && Number.isFinite(saved.coolingRate)
      ? saved.coolingRate
      : dflt.coolingRate,
  }
}

function load(): PersistedState {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return freshState()
    return sanitize(JSON.parse(text))
  } catch {
    return freshState()
  }
}

const initial = load()

/** 面板记忆（单例）：刷新后仍保留每个算法上次调好的值与当前选择 */
export const panelMemory = reactive<PersistedState>(initial)

export function rememberBag(algorithm: AlgorithmId, bag: ParamBag) {
  panelMemory.bags[algorithm] = { ...bag }
  persist()
}

export function rememberSelection(algorithm: AlgorithmId, functionId: FunctionId) {
  panelMemory.algorithm = algorithm
  panelMemory.functionId = functionId
  persist()
}

export function resetBag(algorithm: AlgorithmId, functionId: FunctionId): ParamBag {
  const bag = defaultBag(algorithm, functionId)
  panelMemory.bags[algorithm] = { ...bag }
  persist()
  return bag
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelMemory))
  } catch {
    // localStorage 不可用时静默降级为会话内记忆
  }
}
