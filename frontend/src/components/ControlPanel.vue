<template>
  <div class="control-card">
    <el-form :model="form" inline>
      <el-form-item label="测试函数">
        <el-select v-model="form.functionId" style="width:180px">
          <el-option v-for="f in TEST_FUNCTIONS" :key="f.id" :label="f.name" :value="f.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="算法">
        <el-select v-model="form.algorithm" style="width:150px">
          <el-option v-for="a in ALGORITHMS" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="初始X">
        <el-input-number v-model="form.x0" :min="-10" :max="10" :step="0.5" size="small" />
      </el-form-item>
      <el-form-item label="初始Y">
        <el-input-number v-model="form.y0" :min="-10" :max="10" :step="0.5" size="small" />
      </el-form-item>

      <el-form-item v-for="p in activeParams" :key="p" :label="PARAM_LABELS[p]">
        <div class="param-field" :class="{ 'has-error': isOutOfRange(p) }">
          <el-input-number
            v-model="form[p]"
            :step="paramStep(p)"
            :precision="paramPrecision(p)"
            size="small"
          />
          <div class="param-hint" :class="{ error: isOutOfRange(p) }">{{ hintText(p) }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="run" :loading="store.loading">🚀 开始优化</el-button>
      </el-form-item>
    </el-form>
    <div class="range-note">
      💡 各参数的允许范围与推荐区间随「算法 × 测试函数」自动切换；每种算法会记住上次调好的值（刷新后保留）。留空的字段按默认值处理。
    </div>

    <div class="animation-bar" v-if="store.result">
      <div class="anim-controls">
        <el-button size="small" @click="store.playAnimation" :disabled="store.isPlaying">▶ 播放</el-button>
        <el-button size="small" @click="store.pauseAnimation" :disabled="!store.isPlaying">⏸ 暂停</el-button>
        <el-button size="small" @click="store.resetAnimation">⏹ 重置</el-button>
      </div>
      <el-slider v-model="animStep" :min="0" :max="maxStep" @input="onSlider" style="flex:1;margin:0 20px" />
      <span class="step-text">步 {{ animStep }}/{{ maxStep }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useOptimizationStore } from '../store/optimization'
import {
  TEST_FUNCTIONS, ALGORITHMS, PARAM_LABELS, ALGORITHM_PARAMS,
  getParamRule, DEFAULT_FUNCTION_ID, DEFAULT_ALGORITHM, DEFAULT_START,
  type TunableParam, type OptimizationParams,
} from '../types'

interface PanelForm {
  algorithm: string
  functionId: string
  x0?: number
  y0?: number
  learningRate?: number
  iterations?: number
  momentum?: number
  temperature?: number
  coolingRate?: number
}

const store = useOptimizationStore()

// ---------- 每种算法的调参记忆（localStorage 持久化，刷新后保留） ----------
const MEMORY_KEY = 'opt-param-memory-v1'
interface PersistedMemory {
  lastAlgorithm?: string
  byAlgorithm?: Record<string, Partial<PanelForm>>
}

function loadMemory(): PersistedMemory {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

/** 过滤掉空值与非法值，让默认值能够透出 */
function cleanSnapshot(snap?: Partial<PanelForm>): Partial<PanelForm> {
  const out: Partial<PanelForm> = {}
  if (!snap) return out
  for (const [k, v] of Object.entries(snap)) {
    if (v === null || v === undefined) continue
    if (k === 'algorithm' || k === 'functionId') {
      if (typeof v === 'string') (out as Record<string, unknown>)[k] = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

function defaultsFor(algorithm: string, functionId: string): PanelForm {
  const def = (p: TunableParam) => getParamRule(algorithm, functionId, p)?.default
  return {
    algorithm,
    functionId,
    x0: DEFAULT_START.x0,
    y0: DEFAULT_START.y0,
    learningRate: def('learningRate'),
    iterations: def('iterations'),
    momentum: def('momentum'),
    temperature: def('temperature'),
    coolingRate: def('coolingRate'),
  }
}

function persistSnapshot(algorithm: string) {
  if (!algorithm) return
  const mem = loadMemory()
  mem.byAlgorithm = mem.byAlgorithm || {}
  const { algorithm: _omit, ...snapshot } = form
  mem.byAlgorithm[algorithm] = { ...snapshot }
  mem.lastAlgorithm = form.algorithm
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)) } catch { /* 存储不可用时静默跳过 */ }
}

// ---------- 表单初始化：恢复上次使用的算法及其记住的值 ----------
const persisted = loadMemory()
const initialAlgorithm = ALGORITHMS.some(a => a.id === persisted.lastAlgorithm)
  ? persisted.lastAlgorithm! : DEFAULT_ALGORITHM
const initialSnap = cleanSnapshot(persisted.byAlgorithm?.[initialAlgorithm])
const initialFunctionId = TEST_FUNCTIONS.some(f => f.id === initialSnap.functionId)
  ? initialSnap.functionId! : DEFAULT_FUNCTION_ID

const form = reactive<PanelForm>({
  ...defaultsFor(initialAlgorithm, initialFunctionId),
  ...initialSnap,
  algorithm: initialAlgorithm,
  functionId: initialFunctionId,
})

const activeParams = computed<TunableParam[]>(() => ALGORITHM_PARAMS[form.algorithm] || ['iterations'])

// 切换算法：先把当前值存入旧算法的记忆，再载入新算法上次调好的值；
// 该算法没有记忆时，仅把超参数重置为默认值，保留当前函数与初始点
watch(() => form.algorithm, (newAlg, oldAlg) => {
  persistSnapshot(oldAlg)
  const snap = cleanSnapshot(loadMemory().byAlgorithm?.[newAlg])
  if (Object.keys(snap).length > 0) {
    const functionId = TEST_FUNCTIONS.some(f => f.id === snap.functionId) ? snap.functionId! : form.functionId
    Object.assign(form, defaultsFor(newAlg, functionId), snap, { algorithm: newAlg, functionId })
  } else {
    for (const p of ['learningRate', 'iterations', 'momentum', 'temperature', 'coolingRate'] as const) {
      form[p] = getParamRule(newAlg, form.functionId, p)?.default
    }
  }
})

// 参数一变就写入当前算法的记忆（算法切换由上面的 watcher 单独处理，避免串档）
watch(
  () => [form.functionId, form.x0, form.y0, form.learningRate, form.iterations, form.momentum, form.temperature, form.coolingRate],
  () => persistSnapshot(form.algorithm)
)

// ---------- 范围提示与校验 ----------
const algName = computed(() => ALGORITHMS.find(a => a.id === form.algorithm)?.name || form.algorithm)
const fnName = computed(() => TEST_FUNCTIONS.find(f => f.id === form.functionId)?.name || form.functionId)

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))

function isOutOfRange(p: TunableParam): boolean {
  const v = form[p]
  if (isEmpty(v)) return false // 空值走默认值逻辑，不算越界
  const rule = getParamRule(form.algorithm, form.functionId, p)
  return !!rule && ((v as number) < rule.min || (v as number) > rule.max)
}

function hintText(p: TunableParam): string {
  const rule = getParamRule(form.algorithm, form.functionId, p)
  if (!rule) return ''
  if (isOutOfRange(p)) return `超出允许范围 [${rule.min}, ${rule.max}]`
  return `允许 [${rule.min}, ${rule.max}] · 推荐 ${rule.recommended[0]}–${rule.recommended[1]}`
}

function paramStep(p: TunableParam): number {
  return { learningRate: 0.001, momentum: 0.05, temperature: 10, coolingRate: 0.01, iterations: 10 }[p]
}
function paramPrecision(p: TunableParam): number {
  return { learningRate: 4, momentum: 2, temperature: 0, coolingRate: 3, iterations: 0 }[p]
}

function run() {
  // 1) 留空/只填一半 → 按默认值补上并说明（不取上一次运行结果里的值）
  const notes: string[] = []
  const fillDefault = (key: 'x0' | 'y0' | TunableParam, def: number | undefined, label: string) => {
    if (def === undefined || !isEmpty(form[key])) return
    form[key] = def
    notes.push(`${label}未填写，已按默认值 ${def} 处理`)
  }
  fillDefault('x0', DEFAULT_START.x0, '初始X')
  fillDefault('y0', DEFAULT_START.y0, '初始Y')
  for (const p of activeParams.value) {
    fillDefault(p, getParamRule(form.algorithm, form.functionId, p)?.default, PARAM_LABELS[p])
  }
  if (notes.length) ElMessage.warning(notes.join('；'))

  // 2) 超出允许范围 → 阻止开始并说明原因
  const errors: string[] = []
  for (const p of activeParams.value) {
    const rule = getParamRule(form.algorithm, form.functionId, p)
    const v = form[p]
    if (!rule || typeof v !== 'number') continue
    if (v < rule.min || v > rule.max) {
      errors.push(
        `${PARAM_LABELS[p]} = ${v}，超出「${algName.value} × ${fnName.value}」的允许范围 ` +
        `[${rule.min}, ${rule.max}]（推荐 ${rule.recommended[0]}–${rule.recommended[1]}）。${rule.reason}`
      )
    }
  }
  if (errors.length) {
    ElMessageBox.alert(errors.map(e => `• ${e}`).join('<br>'), '参数超出允许范围，无法开始优化', {
      dangerouslyUseHTMLString: true, type: 'error', confirmButtonText: '知道了',
    })
    return
  }

  // 3) 记住当前算法的调参并运行；空值不发给后端，由后端默认值兜底
  persistSnapshot(form.algorithm)
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(form)) {
    if (v !== undefined && v !== null) payload[k] = v
  }
  store.runOptimization(payload as unknown as OptimizationParams)
}

// ---------- 动画控制 ----------
const animStep = ref(0)
const maxStep = computed(() => Math.max(0, (store.result?.path.length || 1) - 1))

watch(() => store.animationStep, (v) => { animStep.value = v })

function onSlider(v: number) { store.setStep(v); store.pauseAnimation() }
</script>

<style scoped>
.control-card { background:#fff; border-radius:8px; padding:16px 20px; box-shadow:0 2px 8px rgba(0,0,0,.06); margin-bottom:16px }
.param-field { display:inline-block; vertical-align:top }
.param-hint { font-size:11px; color:#909399; margin-top:2px; line-height:1.3; max-width:210px; white-space:normal }
.param-hint.error { color:#f56c6c }
.param-field.has-error :deep(.el-input__wrapper) { box-shadow:0 0 0 1px #f56c6c inset }
.range-note { margin-top:4px; font-size:12px; color:#909399 }
.animation-bar { display:flex; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #eee }
.anim-controls { display:flex; gap:6px }
.step-text { font-size:13px; color:#666; white-space:nowrap }
</style>
