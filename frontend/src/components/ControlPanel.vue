<template>
  <div class="control-card">
    <el-form :model="form" inline class="param-form">
      <el-form-item label="测试函数">
        <el-select :model-value="form.functionId" style="width:180px" @change="onFunctionChange">
          <el-option v-for="f in TEST_FUNCTIONS" :key="f.id" :label="f.name" :value="f.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="算法">
        <el-select :model-value="form.algorithm" style="width:150px" @change="onAlgorithmChange">
          <el-option v-for="a in ALGORITHMS" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="初始X">
        <div class="param-cell">
          <el-input-number v-model="form.x0" :min="-10" :max="10" :step="0.5" :value-on-clear="null" size="small" />
          <div class="param-hint hint-info">留空按推荐起点 {{ fmt(fnMeta.defaultStart[0]) }}</div>
        </div>
      </el-form-item>
      <el-form-item label="初始Y">
        <div class="param-cell">
          <el-input-number v-model="form.y0" :min="-10" :max="10" :step="0.5" :value-on-clear="null" size="small" />
          <div class="param-hint hint-info">留空按推荐起点 {{ fmt(fnMeta.defaultStart[1]) }}</div>
        </div>
      </el-form-item>

      <el-form-item v-if="lrSpec" label="学习率">
        <div class="param-cell">
          <el-input-number
            v-model="form.learningRate"
            :step="lrSpec.step"
            :value-on-clear="null"
            size="small"
            :class="issueClass('learningRate')"
          />
          <div class="param-hint" :class="hintClass('learningRate')">
            <template v-if="form.learningRate === null">留空 → 默认 {{ fmt(lrSpec.default) }}；</template>
            允许 {{ fmt(lrSpec.min) }}~{{ fmt(lrSpec.max) }}，推荐 {{ fmt(lrSpec.recommended[0]) }}~{{ fmt(lrSpec.recommended[1]) }}
          </div>
          <div class="param-note" v-if="lrSpec.note">ℹ️ {{ lrSpec.note }}</div>
        </div>
      </el-form-item>

      <el-form-item label="迭代">
        <div class="param-cell">
          <el-input-number
            v-model="form.iterations"
            :step="10"
            :value-on-clear="null"
            size="small"
            :class="issueClass('iterations')"
          />
          <div class="param-hint" :class="hintClass('iterations')">
            <template v-if="form.iterations === null">留空 → 默认 {{ fmt(iterSpec.default) }}；</template>
            允许 {{ fmt(iterSpec.min) }}~{{ fmt(iterSpec.max) }}，推荐 {{ fmt(iterSpec.recommended[0]) }}~{{ fmt(iterSpec.recommended[1]) }}
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="momentumSpec" label="动量">
        <div class="param-cell">
          <el-input-number
            v-model="form.momentum"
            :step="momentumSpec.step"
            :value-on-clear="null"
            size="small"
            :class="issueClass('momentum')"
          />
          <div class="param-hint" :class="hintClass('momentum')">
            <template v-if="form.momentum === null">留空 → 默认 {{ fmt(momentumSpec.default) }}；</template>
            允许 {{ fmt(momentumSpec.min) }}~{{ fmt(momentumSpec.max) }}，推荐 {{ fmt(momentumSpec.recommended[0]) }}~{{ fmt(momentumSpec.recommended[1]) }}
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="tempSpec" label="温度">
        <div class="param-cell">
          <el-input-number
            v-model="form.temperature"
            :step="tempSpec.step"
            :value-on-clear="null"
            size="small"
            :class="issueClass('temperature')"
          />
          <div class="param-hint" :class="hintClass('temperature')">
            <template v-if="form.temperature === null">留空 → 默认 {{ fmt(tempSpec.default) }}；</template>
            允许 {{ fmt(tempSpec.min) }}~{{ fmt(tempSpec.max) }}，推荐 {{ fmt(tempSpec.recommended[0]) }}~{{ fmt(tempSpec.recommended[1]) }}
          </div>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="hasErrors || store.loading" :loading="store.loading" @click="run">
          🚀 开始优化
        </el-button>
        <el-button size="small" @click="resetToDefaults">恢复默认参数</el-button>
      </el-form-item>
    </el-form>

    <el-alert
      v-for="(msg, i) in errors"
      :key="'e' + i"
      class="form-alert"
      type="error"
      show-icon
      :closable="false"
      :title="msg"
    />
    <el-alert
      v-for="(msg, i) in warnings"
      :key="'w' + i"
      class="form-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="msg"
    />
    <el-alert
      v-for="(msg, i) in defaultNotes"
      :key="'i' + i"
      class="form-alert"
      type="info"
      show-icon
      :closable="false"
      :title="msg"
    />
    <div v-if="hasErrors" class="block-tip">⚠️ 存在超出允许范围的参数，已阻止开始优化，请按提示修改后再运行。</div>

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
import { useOptimizationStore } from '../store/optimization'
import { panelMemory, rememberSelection, resetBag } from '../store/panelMemory'
import {
  TEST_FUNCTIONS, ALGORITHMS, ALGO_PARAM_KEYS,
  getSpecConfig, getFunction,
  type AlgorithmId,
  type FunctionId,
  type NumericSpec,
  type ParamBag,
  type TunableKey,
} from '../types'
import { assessBag, resolveParams, fmt, type FieldIssue } from '../lib/validation'

const store = useOptimizationStore()

type PanelForm = ParamBag & { algorithm: AlgorithmId; functionId: FunctionId }

const form = reactive<PanelForm>({
  algorithm: panelMemory.algorithm,
  functionId: panelMemory.functionId,
  ...cloneBag(panelMemory.bags[panelMemory.algorithm]),
})

function cloneBag(bag: ParamBag): ParamBag {
  return { ...bag }
}

const defaultNotes = ref<string[]>([])

const specCfg = computed(() => getSpecConfig(form.algorithm, form.functionId))
const fnMeta = computed(() => getFunction(form.functionId))
const activeKeys = computed<TunableKey[]>(() => ALGO_PARAM_KEYS[form.algorithm])

const lrSpec = computed<NumericSpec | undefined>(() => specCfg.value.learningRate)
const momentumSpec = computed<NumericSpec | undefined>(() => specCfg.value.momentum)
const tempSpec = computed<NumericSpec | undefined>(() => specCfg.value.temperature)
const iterSpec = computed<NumericSpec>(() => specCfg.value.iterations)

const assessment = computed(() => assessBag(form.algorithm, form.functionId, form))
const issueMap = computed(() => assessment.value.issues)
const errors = computed(() => assessment.value.errors)
const warnings = computed(() => assessment.value.warnings)
const hasErrors = computed(() => assessment.value.hasErrors)

function issueClass(key: TunableKey) {
  const issue: FieldIssue | undefined = issueMap.value[key]
  if (!issue) return ''
  return issue.level === 'error' ? 'param-invalid' : 'param-warn'
}
function hintClass(key: TunableKey) {
  const issue: FieldIssue | undefined = issueMap.value[key]
  if (!issue) return 'hint-muted'
  return issue.level === 'error' ? 'hint-error' : 'hint-warn'
}

function bagFromForm(): ParamBag {
  return {
    x0: form.x0, y0: form.y0,
    learningRate: form.learningRate, iterations: form.iterations,
    momentum: form.momentum, temperature: form.temperature,
    coolingRate: form.coolingRate,
  }
}

/** 切换算法：先记住当前算法调好的值，再换回目标算法上次的值；范围标准随算法+函数一起换 */
function onAlgorithmChange(next: AlgorithmId) {
  defaultNotes.value = []
  Object.assign(form, cloneBag(panelMemory.bags[next]))
  form.algorithm = next
}

/** 切换函数：保留该算法记住的数值，取值上限与推荐区间切换为当前函数的标准 */
function onFunctionChange(next: FunctionId) {
  defaultNotes.value = []
  form.functionId = next
}

function resetToDefaults() {
  Object.assign(form, resetBag(form.algorithm, form.functionId))
  defaultNotes.value = ['已恢复为当前算法在该函数下的默认参数（推荐区间内的典型值）。']
}

/** 任何编辑都实时写入各算法独立的记忆，刷新后仍在 */
watch(form, () => {
  panelMemory.bags[form.algorithm] = bagFromForm()
  rememberSelection(form.algorithm, form.functionId)
}, { deep: true })

function run() {
  if (hasErrors.value) return
  // 留空字段按当前算法×函数的默认值填入；只使用面板上的值，绝不回填上一次运行结果
  const { params, notes } = resolveParams(form.algorithm, form.functionId, bagFromForm())
  Object.assign(form, params)
  defaultNotes.value = notes
  store.runOptimization(params)
}

const animStep = ref(0)
const maxStep = computed(() => Math.max(0, (store.result?.path.length || 1) - 1))
watch(() => store.animationStep, (v) => { animStep.value = v })
function onSlider(v: number) { store.setStep(v); store.pauseAnimation() }
</script>

<style scoped>
.control-card { background:#fff; border-radius:8px; padding:16px 20px; box-shadow:0 2px 8px rgba(0,0,0,.06); margin-bottom:16px }
.param-form :deep(.el-form-item) { margin-bottom:12px }
.param-cell { display:flex; flex-direction:column; gap:2px }
.param-hint { font-size:11px; line-height:1.3; white-space:nowrap }
.param-note { font-size:11px; line-height:1.3; color:#909399; max-width:260px; white-space:normal }
.hint-muted { color:#909399 }
.hint-info { color:#909399 }
.hint-warn { color:#e6a23c }
.hint-error { color:#f56c6c }
.param-invalid :deep(.el-input__wrapper) { box-shadow:0 0 0 1px #f56c6c inset !important }
.param-warn :deep(.el-input__wrapper) { box-shadow:0 0 0 1px #e6a23c inset !important }
.form-alert { margin-top:8px }
.block-tip { margin-top:8px; color:#f56c6c; font-size:13px }
.animation-bar { display:flex; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #eee }
.anim-controls { display:flex; gap:6px }
.step-text { font-size:13px; color:#666; white-space:nowrap }
</style>
