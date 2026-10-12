<script setup lang="ts">
import {
	AppearanceSettingsLayout,
	ColorPicker,
	injectAuth,
	injectUserPreferences,
	provideAppearanceSettings,
	useSavable,
} from '@modrinth/ui'
import { platform } from '@tauri-apps/plugin-os'
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'

import { useAppSettings } from '@/composables/use-app-settings.ts'
import { type ColorTheme, isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { type AppSettings, get, set } from '@/helpers/settings.ts'
import { appSettingsModalContextKey } from '@/providers/app-settings-modal'

const theme = useTheme()
const appSettings = useAppSettings()
const auth = injectAuth()
const { updatePreferences } = injectUserPreferences()
const settingsModal = inject(appSettingsModalContextKey, null)
const os = platform()

type AppearanceSettingsState = {
	theme: ColorTheme
	syncAcrossDevices: boolean
	advancedRendering: boolean
	nativeDecorations: boolean
}

function getAppearanceSettingsState(): AppearanceSettingsState {
	return {
		theme: theme.preferred,
		syncAcrossDevices: theme.syncAcrossDevices,
		advancedRendering: theme.advancedRendering,
		nativeDecorations: appSettings.nativeDecorations,
	}
}

const { saved, current, changes, saving, hasChanges, reset, save } = useSavable(
	getAppearanceSettingsState,
	async (appearanceChanges) => {
		const value = current.value
		if (
			value.syncAcrossDevices &&
			auth.user.value &&
			(appearanceChanges.theme !== undefined || appearanceChanges.syncAcrossDevices !== undefined)
		) {
			await updatePreferences({
				appearance: value.theme === 'system' ? { auto: true } : { auto: false, theme: value.theme },
			})
		}

		const nextSettings: AppSettings = {
			...(await get()),
			theme: value.theme,
			sync_theme_across_devices: value.syncAcrossDevices,
			advanced_rendering: value.advancedRendering,
			native_decorations: value.nativeDecorations,
		}

		await set(nextSettings)
		if (isDarkTheme(value.theme)) {
			theme.preferredDark = value.theme
		}
		theme.preferred = value.theme
		theme.syncAcrossDevices = value.syncAcrossDevices
		theme.advancedRendering = value.advancedRendering
		appSettings.nativeDecorations = value.nativeDecorations
	},
)

const themeOptions = computed(() =>
	theme.options.filter(
		(option) => option !== 'retro' || appSettings.devMode || current.value.theme === 'retro',
	),
)

const preferredDarkTheme = computed(() =>
	isDarkTheme(current.value.theme) ? current.value.theme : theme.preferredDark,
)

function setTheme(value: ColorTheme): void {
	current.value.theme = value
}

function setAccentMode(mode: (typeof theme.accentModes)[number]): void {
	theme.accent.mode = mode
}

function setSyncAcrossDevices(enabled: boolean): void {
	current.value.syncAcrossDevices = enabled
}

function setAdvancedRendering(enabled: boolean): void {
	current.value.advancedRendering = enabled
}

function setNativeDecorations(enabled: boolean): void {
	current.value.nativeDecorations = enabled
}

watch(
	[() => current.value.theme, () => saved.value.theme],
	([selectedTheme, savedTheme]) => {
		theme.preview = selectedTheme === savedTheme ? null : selectedTheme
	},
	{ immediate: true },
)

async function saveAppearanceSettings(): Promise<void> {
	try {
		await save()
	} catch {
		return
	}
}

onMounted(() => {
	settingsModal?.registerUnsavedChangesController({
		hasChanges: () => hasChanges.value,
		getOriginal: () => saved.value,
		getModified: () => changes.value,
		isSaving: () => saving.value,
		reset,
		save: saveAppearanceSettings,
	})
})

onBeforeUnmount(() => {
	theme.preview = null
	settingsModal?.registerUnsavedChangesController(null)
})

provideAppearanceSettings({
	deferPersistence: true,
	theme: {
		current: computed(() => current.value.theme),
		options: themeOptions,
		system: computed(() => (theme.native === 'light' ? 'light' : preferredDarkTheme.value)),
		preferredDark: preferredDarkTheme,
		set: setTheme,
		syncAcrossDevices: {
			value: computed(() => current.value.syncAcrossDevices),
			set: setSyncAcrossDevices,
		},
		syncDisabled: computed(() => !auth.user.value),
	},
	advancedRendering: {
		value: computed(() => current.value.advancedRendering),
		set: setAdvancedRendering,
	},
	nativeDecorations:
		os !== 'macos'
			? {
					value: computed(() => current.value.nativeDecorations),
					set: setNativeDecorations,
				}
			: undefined,
	updatePreferences,
})
</script>

<template>
	<div>
		<AppearanceSettingsLayout />
		<section class="mt-8 border-0 border-t border-solid border-divider pt-6">
			<div class="rounded-xl border border-solid border-divider bg-surface-2 p-4">
				<h2 class="m-0 text-xl font-semibold text-contrast">Accent color</h2>
				<p class="mt-1 text-secondary">
					Choose a ready color, your own color, a moving rainbow, or a two-color palette.
				</p>
				<div class="mt-4 flex flex-wrap gap-2">
					<button
						v-for="mode in theme.accentModes"
						:key="mode"
						type="button"
						class="rounded-lg border border-solid px-3 py-2 text-sm font-semibold transition-colors"
						:class="
							theme.accent.mode === mode
								? 'border-brand bg-brand-highlight text-brand'
								: 'border-divider bg-surface-3 text-secondary hover:text-primary'
						"
						@click="setAccentMode(mode)"
					>
						{{ mode === 'solid' ? 'Single color' : mode === 'rainbow' ? 'Rainbow' : 'Two colors' }}
					</button>
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-4">
					<label class="flex items-center gap-2 text-sm text-secondary">
						<span>{{ theme.accent.mode === 'duotone' ? 'First color' : 'Color' }}</span>
						<ColorPicker v-model="theme.accent.primary" label="Choose accent color" />
					</label>
					<label
						v-if="theme.accent.mode === 'duotone'"
						class="flex items-center gap-2 text-sm text-secondary"
					>
						<span>Second color</span>
						<ColorPicker v-model="theme.accent.secondary" label="Choose second accent color" />
					</label>
				</div>
				<div
					class="mt-4 h-3 rounded-full"
					:style="{
						background:
							theme.accent.mode === 'rainbow'
								? 'linear-gradient(90deg, #f44, #fd4, #4d7, #4df, #84f, #f4d, #f44)'
								: `linear-gradient(90deg, ${theme.accent.primary}, ${theme.accent.secondary})`,
					}"
				/>
			</div>
		</section>
	</div>
</template>
