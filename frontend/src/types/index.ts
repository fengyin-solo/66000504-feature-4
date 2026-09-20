export interface TestFunction {
  id: string
  name: string
  formula: string
  xRange: [number, number]
  yRange: [number, number]
}

export interface Algorithm {
  id: string
  name: string
  description: string
}

export interface OptimizationParams {
  algorithm: string
  functionId: string
  x0: number
  y0: number
  learningRate: number
  iterations: number
  momentum?: number
  temperature?: number
  coolingRate?: number
}

export interface IterationPoint {
  step: number
  x: number
  y: number
  z: number
}

export interface OptimizationResult {
  params: OptimizationParams
  path: IterationPoint[]
  finalPoint: [number, number]
  finalValue: number
  iterations: number
  converged: boolean
}

export const TEST_FUNCTIONS: TestFunction[] = [
  { id: 'rosenbrock', name: 'Rosenbrock 香蕉函数', formula: 'f=(1-x)²+100(y-x²)²', xRange: [-2, 2], yRange: [-1, 3] },
  { id: 'himmelblau', name: 'Himmelblau函数', formula: 'f=(x²+y-11)²+(x+y²-7)²', xRange: [-6, 6], yRange: [-6, 6] },
  { id: 'rastrigin', name: 'Rastrigin函数', formula: 'f=20+x²-10cos(2πx)+y²-10cos(2πy)', xRange: [-5.12, 5.12], yRange: [-5.12, 5.12] },
  { id: 'sphere', name: 'Sphere球函数', formula: 'f=x²+y²', xRange: [-5, 5], yRange: [-5, 5] },
  { id: 'beale', name: 'Beale函数', formula: 'f=(1.5-x+xy)²+(2.25-x+xy²)²+(2.625-x+xy³)²', xRange: [-4.5, 4.5], yRange: [-4.5, 4.5] },
  { id: 'booth', name: 'Booth函数', formula: 'f=(x+2y-7)²+(2x+y-5)²', xRange: [-10, 10], yRange: [-10, 10] },
]

export const ALGORITHMS: Algorithm[] = [
  { id: 'gradient_descent', name: '梯度下降', description: '沿负梯度方向迭代更新，包含动量项' },
  { id: 'newton', name: '牛顿法', description: '利用Hessian二阶导数加速收敛' },
  { id: 'conjugate_gradient', name: '共轭梯度', description: '共轭方向搜索，适合大规模问题' },
  { id: 'simulated_annealing', name: '模拟退火', description: '概率接受劣解跳出局部最优' },
]

// ---------- 参数取值规则（按 算法 × 函数 联动） ----------

export type TunableParam = 'learningRate' | 'momentum' | 'temperature' | 'coolingRate' | 'iterations'

export interface ParamRule {
  min: number
  max: number
  recommended: [number, number]
  default: number
  reason: string
}

export const PARAM_LABELS: Record<TunableParam, string> = {
  learningRate: '学习率',
  momentum: '动量',
  temperature: '温度',
  coolingRate: '冷却率',
  iterations: '迭代次数',
}

/** 每个算法实际使用的可调参数（其余参数在面板上不展示） */
export const ALGORITHM_PARAMS: Record<string, TunableParam[]> = {
  gradient_descent: ['learningRate', 'momentum', 'iterations'],
  newton: ['learningRate', 'iterations'],
  conjugate_gradient: ['learningRate', 'iterations'],
  simulated_annealing: ['temperature', 'coolingRate', 'iterations'],
}

interface AlgorithmParamRules {
  params: Partial<Record<TunableParam, ParamRule>>
  /** 学习率对函数梯度尺度最敏感，按函数单独收紧上限与推荐区间 */
  learningRateByFunction?: Record<string, Partial<ParamRule>>
}

/** 梯度类算法（梯度下降 / 共轭梯度）共用的按函数学习率规则 */
const GRADIENT_LR_BY_FUNCTION: Record<string, Partial<ParamRule>> = {
  rosenbrock: { max: 0.01, recommended: [0.0005, 0.005], default: 0.001, reason: 'Rosenbrock 梯度量级可达数千，学习率超过 0.01 极易发散' },
  himmelblau: { max: 0.05, recommended: [0.005, 0.02], default: 0.01, reason: 'Himmelblau 有多个相近极小值，学习率过大容易一步跨过谷底' },
  rastrigin: { max: 0.005, recommended: [0.0005, 0.002], default: 0.001, reason: 'Rastrigin 含高频余弦振荡，局部曲率大，学习率稍大就会震荡发散' },
  sphere: { max: 0.5, recommended: [0.05, 0.3], default: 0.1, reason: 'Sphere 曲率小且各向同性，可承受较大学习率' },
  beale: { max: 0.02, recommended: [0.001, 0.01], default: 0.005, reason: 'Beale 在平坦谷底附近梯度变化剧烈，需要较小学习率' },
  booth: { max: 0.1, recommended: [0.01, 0.08], default: 0.05, reason: 'Booth 为良态二次函数（L≈18），学习率上限约为 2/L' },
}

export const PARAM_RULES: Record<string, AlgorithmParamRules> = {
  gradient_descent: {
    params: {
      learningRate: { min: 0.0001, max: 0.5, recommended: [0.001, 0.05], default: 0.01, reason: '梯度下降对步长敏感，过大易越过极小点发散' },
      momentum: { min: 0, max: 0.99, recommended: [0.5, 0.95], default: 0.9, reason: '动量达到或超过 1 会使速度不断累积而发散，接近 1 时震荡明显' },
      iterations: { min: 10, max: 500, recommended: [50, 200], default: 100, reason: '迭代过少尚未收敛，过多则动画数据量过大' },
    },
    learningRateByFunction: GRADIENT_LR_BY_FUNCTION,
  },
  newton: {
    params: {
      learningRate: { min: 0.001, max: 1, recommended: [0.1, 1], default: 0.5, reason: '牛顿法本身不需要学习率，该值仅在 Hessian 缺失或奇异时作为回退步长' },
      iterations: { min: 5, max: 200, recommended: [10, 50], default: 30, reason: '牛顿法二阶收敛，通常十余步即可收敛' },
    },
  },
  conjugate_gradient: {
    params: {
      learningRate: { min: 0.0001, max: 0.5, recommended: [0.001, 0.05], default: 0.01, reason: '共轭梯度以此作为固定线搜索步长，过大同样会发散' },
      iterations: { min: 10, max: 500, recommended: [50, 200], default: 100, reason: '迭代过少尚未收敛，过多则动画数据量过大' },
    },
    learningRateByFunction: GRADIENT_LR_BY_FUNCTION,
  },
  simulated_annealing: {
    params: {
      temperature: { min: 1, max: 1000, recommended: [50, 500], default: 100, reason: '温度过低难以跳出局部最优，过高则长期随机游走不收敛' },
      coolingRate: { min: 0.8, max: 0.999, recommended: [0.9, 0.99], default: 0.95, reason: '冷却过快（低于 0.8）退火不充分，容易陷入局部最优' },
      iterations: { min: 10, max: 500, recommended: [100, 300], default: 200, reason: '退火需要足够步数完成整个降温过程' },
    },
  },
}

/** 取某算法在某函数上的参数规则（学习率自动套用按函数的收紧值），无规则返回 null */
export function getParamRule(algorithm: string, functionId: string, param: TunableParam): ParamRule | null {
  const rules = PARAM_RULES[algorithm]
  const base = rules?.params[param]
  if (!rules || !base) return null
  if (param === 'learningRate' && rules.learningRateByFunction?.[functionId]) {
    return { ...base, ...rules.learningRateByFunction[functionId] }
  }
  return base
}

export const DEFAULT_FUNCTION_ID = 'rosenbrock'
export const DEFAULT_ALGORITHM = 'gradient_descent'
export const DEFAULT_START = { x0: -1.5, y0: 2.5 }