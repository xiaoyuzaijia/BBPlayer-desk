// ESLint 9 flat config
// 组合：@eslint/js（JS 基础）+ typescript-eslint（TS 规则）+ eslint-plugin-vue（Vue 规则）
// 规则策略：用 vue3-recommended + ts strict；未使用变量检查由 ESLint 管
// （tsconfig.web 已关闭 tsc 内置检查，tsconfig.node 仍保留 tsc 检查）
// 检查范围：仅 src/ 下的 .ts/.vue 文件
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import globals from 'globals'

export default tseslint.config(
  // ── 全局忽略 ──
  {
    ignores: ['dist/**', 'node_modules/**', '.trae/**', 'docs/**', 'out/**'],
  },

  // ── JS 基础推荐规则 ──
  js.configs.recommended,

  // ── TS 严格规则（不含 stylistic，避免与未来格式化工具冲突）──
  ...tseslint.configs.strict,

  // ── Vue 3 推荐规则 ──
  ...pluginVue.configs['flat/recommended'],

  // ── 项目特定配置：src/ 下所有 .ts/.vue 文件 ──
  {
    files: ['src/**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        // 让 Vue 文件里的 TS 知道项目类型上下文（启用类型感知规则）
        projectService: true,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
      // 浏览器 + ES2022 全局变量
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      // ── no-unused-vars：接管 tsc 的 noUnusedLocals/Parameters 职责 ──
      // 带 ^_ 前缀的变量/参数/捕获的异常会被忽略，更灵活
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // ── 实用规则 ──
      // 学习项目允许 console（TODO 占位、调试），仅禁 debugger
      'no-console': 'off',
      'no-debugger': 'error',         // debugger 直接报错
      'prefer-const': 'error',        // 能用 const 就不要 let
      'no-var': 'error',              // 禁止 var

      // ── Vue 规则微调 ──
      // SFC 顺序：script setup 在前（与项目约定一致）
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      // 单引号、无分号等格式规则交给未来的 formatter，这里不管
      'vue/multi-word-component-names': 'off',  // 允许单词组件名（如 Player.vue）
      // 允许自闭合组件带内容（v-if 等场景）
      'vue/no-v-html': 'off',         // 学习项目，偶尔需要 v-html
      // 父级用 v-if 控制子组件挂载时，子组件根 Transition 内无需再写 v-if
      'vue/require-toggle-inside-transition': 'off',
    },
  },

  // ── Vue 文件专属：用 vue-eslint-parser 解析模板 ──
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: ['.vue'],
      },
    },
  },
)
