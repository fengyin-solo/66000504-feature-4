export interface TestFunction {
  id: string
  name: string
  formula: string
  xRange: [number, number]
  yRange: [number, number]
  /** 留空时使用的推荐初始点 */
  defaultStart: [number, number]
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
  { id: 'rosenbrock', name: 'Rosenbrock 香蕉函数', formula: 'f=(1-x)²+100(y-x²)²', xRange: [-2, 2], yRange: [-1, 3], defaultStart: [-1.5, 2.5] },
  { id: 'himmelblau', name: 'Himmelblau函数', formula: 'f=(x²+y-11)²+(x+y²-7)²', xRange: [-6, 6], yRange: [-6, 6], defaultStart: [-2, 2] },
  { id: 'rastrigin', name: 'Rastrigin函数', formula: 'f=20+x²-10cos(2πx)+y²-10cos(2πy)', xRange: [-5.12, 5.12], yRange: [-5.12, 5.12], defaultStart: [4.5, 4.5] },
  { id: 'sphere', name: 'Sphere球函数', formula: 'f=x²+y²', xRange: [-5, 5], yRange: [-5, 5], defaultStart: [3, 3] },
  { id: 'beale', name: 'Beale函数', formula: 'f=(1.5-x+xy)²+(2.25-x+xy²)²+(2.625-x+xy³)²', xRange: [-4.5, 4.5], yRange: [-4.5, 4.5], defaultStart: [1, 1] },
  { id: 'booth', name: 'Booth函数', formula: 'f=(x+2y-7)²+(2x+y-5)²', xRange: [-10, 10], yRange: [-10, 10], defaultStart: [0, 0] },
]

export const ALGORITHMS: Algorithm[] = [
  { id: 'gradient_descent', name: '梯度下降', description: '沿负梯度方向迭代更新，包含动量项' },
  { id: 'newton', name: '牛顿法', description: '利用Hessian二阶导数加速收敛' },
  { id: 'conjugate_gradient', name: '共轭梯度', description: '共轭方向搜索，适合大规模问题' },
  { id: 'simulated_annealing', name: '模拟退火', description: '概率接受劣解跳出局部最优' },
]

export type AlgorithmId = 'gradient_descent' | 'newton' | 'conjugate_gradient' | 'simulated_annealing'
export type FunctionId = 'rosenbrock' | 'himmelblau' | 'rastrigin' | 'sphere' | 'beale' | 'booth'

/** 提供了解析 Hessian 的函数，牛顿法对其余函数会回退为固定步长梯度下降 */
export const NEWTON_ANALYTIC_HESSIAN: FunctionId[] = ['rosenbrock', 'sphere', 'booth']

/** 单个数值参数在「某算法 × 某函数」下的取值规范 */
export interface NumericSpec {
  label: string
  /** 允许下限（含） */
  min: number
  /** 允许上限（含），超出即拦截：该组合在后端会发散/溢出而算不出来 */
  max: number
  /** 推荐区间 */
  recommended: [number, number]
  /** 留空时采用的默认值 */
  default: number
  /** 面板步进 */
  step: number
  /** 额外说明（如牛顿法回退提示） */
  note?: string
}

/** 面板字段值：清空输入框后为 null，运行时按默认值处理 */
export interface ParamBag {
  x0: number | null
  y0: number | null
  learningRate: number | null
  iterations: number | null
  momentum: number | null
  temperature: number | null
  coolingRate: number
}

export interface SpecConfig {
  learningRate?: NumericSpec
  momentum?: NumericSpec
  temperature?: NumericSpec
  iterations: NumericSpec
}

export type TunableKey = 'learningRate' | 'momentum' | 'temperature' | 'iterations'

/** 各算法面板上出现、需要按算法+函数校验的字段 */
export const ALGO_PARAM_KEYS: Record<AlgorithmId, TunableKey[]> = {
  gradient_descent: ['learningRate', 'momentum', 'iterations'],
  newton: ['learningRate', 'iterations'],
  conjugate_gradient: ['learningRate', 'iterations'],
  simulated_annealing: ['temperature', 'iterations'],
}

function nspec(
  label: string, min: number, max: number,
  recommended: [number, number], dflt: number, step: number, note?: string,
): NumericSpec {
  return { label, min, max, recommended, default: dflt, step, note }
}

const ITER_SPEC = nspec('迭代次数', 10, 500, [50, 200], 100, 10)

const GD_FALLBACK_NOTE = '该函数未提供解析 Hessian，牛顿法将回退为固定步长梯度下降'

/**
 * 取值规范表：PARAM_SPECS[算法][函数]
 * 上限按各函数梯度/Hessian 的数值尺度标定，超过上限时固定步长迭代会发散或溢出，
 * 因此属于"算不出来"的硬边界；推荐区间内通常能稳定收敛并看到完整路径。
 */
export const PARAM_SPECS: Record<AlgorithmId, Record<FunctionId, SpecConfig>> = {
  gradient_descent: {
    rosenbrock: {
      learningRate: nspec('学习率', 1e-6, 0.0013, [0.0003, 0.001], 0.0005, 0.0001),
      momentum: nspec('动量', 0, 0.99, [0, 0.7], 0.5, 0.05),
      iterations: ITER_SPEC,
    },
    himmelblau: {
      learningRate: nspec('学习率', 1e-6, 0.02, [0.002, 0.01], 0.005, 0.001),
      momentum: nspec('动量', 0, 0.99, [0, 0.8], 0.5, 0.05),
      iterations: ITER_SPEC,
    },
    rastrigin: {
      learningRate: nspec('学习率', 1e-6, 0.05, [0.005, 0.02], 0.01, 0.001),
      momentum: nspec('动量', 0, 0.99, [0, 0.5], 0.3, 0.05),
      iterations: ITER_SPEC,
    },
    sphere: {
      learningRate: nspec('学习率', 1e-6, 1, [0.05, 0.5], 0.1, 0.05),
      momentum: nspec('动量', 0, 0.99, [0, 0.95], 0.8, 0.05),
      iterations: ITER_SPEC,
    },
    beale: {
      learningRate: nspec('学习率', 1e-6, 0.017, [0.001, 0.008], 0.003, 0.001),
      momentum: nspec('动量', 0, 0.99, [0, 0.6], 0.4, 0.05),
      iterations: ITER_SPEC,
    },
    booth: {
      learningRate: nspec('学习率', 1e-6, 0.1, [0.01, 0.05], 0.02, 0.005),
      momentum: nspec('动量', 0, 0.99, [0, 0.9], 0.7, 0.05),
      iterations: ITER_SPEC,
    },
  },
  newton: {
    rosenbrock: {
      learningRate: nspec('学习率', 1e-6, 0.002, [0.0005, 0.002], 0.001, 0.0001, GD_FALLBACK_NOTE),
      iterations: ITER_SPEC,
    },
    himmelblau: {
      learningRate: nspec('学习率', 1e-6, 0.02, [0.002, 0.01], 0.005, 0.001, GD_FALLBACK_NOTE),
      iterations: ITER_SPEC,
    },
    rastrigin: {
      learningRate: nspec('学习率', 1e-6, 0.05, [0.005, 0.02], 0.01, 0.001, GD_FALLBACK_NOTE),
      iterations: ITER_SPEC,
    },
    sphere: {
      learningRate: nspec('学习率', 1e-6, 1, [0.5, 1], 1, 0.05, '解析 Hessian 下一步即到最优点'),
      iterations: ITER_SPEC,
    },
    beale: {
      learningRate: nspec('学习率', 1e-6, 0.08, [0.005, 0.03], 0.01, 0.001, GD_FALLBACK_NOTE),
      iterations: ITER_SPEC,
    },
    booth: {
      learningRate: nspec('学习率', 1e-6, 1, [0.5, 1], 1, 0.05, '解析 Hessian 下为完整牛顿步'),
      iterations: ITER_SPEC,
    },
  },
  conjugate_gradient: {
    rosenbrock: {
      learningRate: nspec('学习率', 1e-6, 0.0002, [5e-5, 0.00015], 0.0001, 0.00005),
      iterations: ITER_SPEC,
    },
    himmelblau: {
      learningRate: nspec('学习率', 1e-6, 0.02, [0.002, 0.01], 0.005, 0.001),
      iterations: ITER_SPEC,
    },
    rastrigin: {
      learningRate: nspec('学习率', 1e-6, 0.01, [0.001, 0.005], 0.002, 0.0005),
      iterations: ITER_SPEC,
    },
    sphere: {
      learningRate: nspec('学习率', 1e-6, 1, [0.1, 0.9], 0.5, 0.05),
      iterations: ITER_SPEC,
    },
    beale: {
      learningRate: nspec('学习率', 1e-6, 0.06, [0.005, 0.03], 0.01, 0.001),
      iterations: ITER_SPEC,
    },
    booth: {
      learningRate: nspec('学习率', 1e-6, 0.14, [0.02, 0.1], 0.05, 0.005),
      iterations: ITER_SPEC,
    },
  },
  simulated_annealing: {
    rosenbrock: {
      temperature: nspec('温度', 1e-3, 5000, [50, 500], 100, 10),
      iterations: ITER_SPEC,
    },
    himmelblau: {
      temperature: nspec('温度', 1e-3, 2000, [100, 1000], 300, 10),
      iterations: ITER_SPEC,
    },
    rastrigin: {
      temperature: nspec('温度', 1e-3, 500, [10, 100], 50, 5),
      iterations: ITER_SPEC,
    },
    sphere: {
      temperature: nspec('温度', 1e-3, 200, [1, 50], 10, 1),
      iterations: ITER_SPEC,
    },
    beale: {
      temperature: nspec('温度', 1e-3, 200000, [1000, 100000], 5000, 100),
      iterations: ITER_SPEC,
    },
    booth: {
      temperature: nspec('温度', 1e-3, 2000, [100, 1000], 300, 10),
      iterations: ITER_SPEC,
    },
  },
}

/** 超出允许范围时的原因说明（按字段） */
export const OUT_OF_RANGE_REASON: Record<TunableKey, string> = {
  learningRate: '学习率超过该算法在当前函数下经数值标定的稳定上限，迭代会越过最优点并持续发散/溢出，无法生成有效路径',
  momentum: '动量必须在 0 ~ 0.99 之间；过大时速度项累积放大，会越过最优点并带动数值发散',
  temperature: '温度须为正且不超过该函数的实用上限；为非正数时 Metropolis 接受概率失效，过高则在默认迭代内无法冷却收敛',
  iterations: '迭代次数需在 10 ~ 500 之间',
}

export function getSpecConfig(algorithm: string, functionId: string): SpecConfig {
  const a = PARAM_SPECS[algorithm as AlgorithmId]
  return (a && a[functionId as FunctionId]) || PARAM_SPECS.gradient_descent.rosenbrock
}

export function getNumericSpec(algorithm: string, functionId: string, key: TunableKey): NumericSpec | undefined {
  return getSpecConfig(algorithm, functionId)[key]
}

export function getFunction(functionId: string): TestFunction {
  return TEST_FUNCTIONS.find((f) => f.id === functionId) || TEST_FUNCTIONS[0]
}

/** 某算法在某函数下的一套默认参数（首次切换到该算法时使用） */
export function defaultBag(algorithm: AlgorithmId, functionId: FunctionId): ParamBag {
  const spec = getSpecConfig(algorithm, functionId)
  const fn = getFunction(functionId)
  return {
    x0: fn.defaultStart[0],
    y0: fn.defaultStart[1],
    learningRate: spec.learningRate ? spec.learningRate.default : null,
    iterations: spec.iterations.default,
    momentum: spec.momentum ? spec.momentum.default : null,
    temperature: spec.temperature ? spec.temperature.default : null,
    coolingRate: 0.95,
  }
}
