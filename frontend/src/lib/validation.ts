import {
  ALGO_PARAM_KEYS,
  getSpecConfig,
  getFunction,
  OUT_OF_RANGE_REASON,
  type AlgorithmId,
  type FunctionId,
  type NumericSpec,
  type ParamBag,
  type TunableKey,
} from '@/types'

export interface FieldIssue {
  level: 'error' | 'warning'
  message: string
}

const WARN_REASON_LOW: Record<TunableKey, string> = {
  learningRate: '步长偏小，可能在迭代上限内无法收敛到最优点',
  momentum: '动量较小，路径接近普通梯度下降，收敛会慢一些，不影响正确性',
  temperature: '温度偏低，接受劣解概率小，模拟退火容易停在局部最优',
  iterations: '迭代次数偏少，路径可能尚未收敛就结束',
}
const WARN_REASON_HIGH: Record<TunableKey, string> = {
  learningRate: '步长偏大，路径可能出现明显震荡，接近上限时甚至发散',
  momentum: '动量接近上限，容易越过谷底并来回震荡',
  temperature: '温度偏高，初期随机游走幅度大，需要更多迭代才能降温收敛',
  iterations: '迭代次数偏多，路径后期基本不再变化',
}

export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return String(parseFloat(v.toPrecision(4)))
}

/** 逐字段判定：超出允许范围 = error（禁止运行）；偏离推荐区间 = warning（允许运行）；留空不判定 */
export function assessField(key: TunableKey, spec: NumericSpec | undefined, value: number | null): FieldIssue | null {
  if (!spec || value === null) return null
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
    return {
      level: 'error',
      message: `「${spec.label}」=${fmt(value)} 超出允许范围 [${fmt(spec.min)}, ${fmt(spec.max)}]：${OUT_OF_RANGE_REASON[key]}。`,
    }
  }
  if (value < spec.recommended[0]) {
    return {
      level: 'warning',
      message: `「${spec.label}」=${fmt(value)} 低于推荐区间 [${fmt(spec.recommended[0])}, ${fmt(spec.recommended[1])}]，${WARN_REASON_LOW[key]}；仍可开始优化。`,
    }
  }
  if (value > spec.recommended[1]) {
    return {
      level: 'warning',
      message: `「${spec.label}」=${fmt(value)} 高于推荐区间 [${fmt(spec.recommended[0])}, ${fmt(spec.recommended[1])}]，${WARN_REASON_HIGH[key]}；仍可开始优化。`,
    }
  }
  return null
}

export interface BagAssessment {
  issues: Partial<Record<TunableKey, FieldIssue>>
  errors: string[]
  warnings: string[]
  hasErrors: boolean
}

/** 对当前算法面板上实际出现的字段做整体判定 */
export function assessBag(algorithm: AlgorithmId, functionId: FunctionId, bag: ParamBag): BagAssessment {
  const cfg = getSpecConfig(algorithm, functionId)
  const issues: Partial<Record<TunableKey, FieldIssue>> = {}
  for (const key of ALGO_PARAM_KEYS[algorithm]) {
    const issue = assessField(key, cfg[key], bag[key])
    if (issue) issues[key] = issue
  }
  const errors = Object.values(issues).filter((i) => i.level === 'error').map((i) => i.message)
  const warnings = Object.values(issues).filter((i) => i.level === 'warning').map((i) => i.message)
  return { issues, errors, warnings, hasErrors: errors.length > 0 }
}

export interface ResolveResult {
  params: {
    algorithm: AlgorithmId
    functionId: FunctionId
    x0: number
    y0: number
    learningRate: number
    iterations: number
    momentum: number
    temperature: number
    coolingRate: number
  }
  /** 留空字段被默认值替换的说明 */
  notes: string[]
}

/**
 * 把可能含 null（留空）的面板值解析为可提交参数：
 * 留空字段一律按当前算法×函数的默认值填入并给出说明；
 * 面板未显示的字段也补齐成后端需要的数值（这些字段会被后端忽略）。
 * 调用前应先用 assessBag 确认没有 error。
 */
export function resolveParams(algorithm: AlgorithmId, functionId: FunctionId, bag: ParamBag): ResolveResult {
  const cfg = getSpecConfig(algorithm, functionId)
  const fn = getFunction(functionId)
  const algoName = algoLabel(algorithm)
  const notes: string[] = []

  const out: ParamBag = { ...bag }

  for (const key of ALGO_PARAM_KEYS[algorithm]) {
    const spec = cfg[key]
    if (spec && out[key] === null) {
      out[key] = spec.default
      notes.push(`「${spec.label}」为留空，已按 ${algoName} · ${fn.name} 的默认值 ${fmt(spec.default)} 填入（推荐区间 [${fmt(spec.recommended[0])}, ${fmt(spec.recommended[1])}] 内）。`)
    }
  }

  if (out.x0 === null) {
    out.x0 = fn.defaultStart[0]
    notes.push(`「初始X」为留空，已按推荐起点 ${fmt(out.x0)} 填入。`)
  }
  if (out.y0 === null) {
    out.y0 = fn.defaultStart[1]
    notes.push(`「初始Y」为留空，已按推荐起点 ${fmt(out.y0)} 填入。`)
  }

  return {
    params: {
      algorithm,
      functionId,
      x0: out.x0 as number,
      y0: out.y0 as number,
      learningRate: out.learningRate ?? 0.01,
      iterations: out.iterations ?? cfg.iterations.default,
      momentum: out.momentum ?? 0.9,
      temperature: out.temperature ?? 100,
      coolingRate: out.coolingRate,
    },
    notes,
  }
}

function algoLabel(algorithm: AlgorithmId): string {
  const map: Record<AlgorithmId, string> = {
    gradient_descent: '梯度下降',
    newton: '牛顿法',
    conjugate_gradient: '共轭梯度',
    simulated_annealing: '模拟退火',
  }
  return map[algorithm]
}
