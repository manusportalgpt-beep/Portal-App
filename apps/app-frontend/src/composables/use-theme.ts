import { prepareThemeColorTransition } from '@modrinth/ui'
import { computed, reactive, ref, watch } from 'vue'

export const THEME_OPTIONS = ['dark', 'light', 'oled', 'retro', 'system'] as const
export const DARK_THEMES = ['dark', 'oled', 'retro'] as const
export const ACCENT_MODES = ['solid', 'rainbow', 'duotone'] as const

export type ColorTheme = (typeof THEME_OPTIONS)[number]
export type DarkTheme = (typeof DARK_THEMES)[number]
export type AccentMode = (typeof ACCENT_MODES)[number]
type Theme = Exclude<ColorTheme, 'system'>
type NativeTheme = 'light' | 'dark'

const PREFERRED_THEME_KEY = 'modrinth-theme'
const PREFERRED_DARK_THEME_KEY = 'modrinth-preferred-dark-theme'
const ACCENT_SETTINGS_KEY = 'portal-app-accent-settings'

export type AccentSettings = {
	mode: AccentMode
	primary: string
	secondary: string
}

const DEFAULT_ACCENT: AccentSettings = {
	mode: 'solid',
	primary: '#e5484d',
	secondary: '#ff8a65',
}

export function isDarkTheme(theme: string): theme is DarkTheme {
	return (DARK_THEMES as readonly string[]).includes(theme)
}

function loadPreferredTheme(): ColorTheme {
	try {
		const stored = window.localStorage.getItem(PREFERRED_THEME_KEY)
		if (stored && (THEME_OPTIONS as readonly string[]).includes(stored)) {
			return stored as ColorTheme
		}
	} catch {
		// storage blocked or full
	}

	for (const option of THEME_OPTIONS) {
		if (option !== 'system' && document.documentElement.classList.contains(`${option}-mode`)) {
			return option
		}
	}

	return 'dark'
}

function loadPreferredDarkTheme(): DarkTheme {
	try {
		const stored = window.localStorage.getItem(PREFERRED_DARK_THEME_KEY)
		if (stored && isDarkTheme(stored)) {
			return stored
		}
	} catch {
		// storage blocked or full
	}

	return 'dark'
}

function loadAccentSettings(): AccentSettings {
	try {
		const value = JSON.parse(window.localStorage.getItem(ACCENT_SETTINGS_KEY) ?? 'null')
		if (
			value &&
			ACCENT_MODES.includes(value.mode) &&
			/^#[0-9a-f]{6}$/i.test(value.primary) &&
			/^#[0-9a-f]{6}$/i.test(value.secondary)
		) {
			return value
		}
	} catch {
		// storage blocked, invalid, or full
	}
	return { ...DEFAULT_ACCENT }
}

const preferred = ref<ColorTheme>(loadPreferredTheme())
const preview = ref<ColorTheme | null>(null)
const preferredDark = ref<DarkTheme>(loadPreferredDarkTheme())
const advancedRendering = ref(true)
const syncAcrossDevices = ref(false)
const accent = reactive<AccentSettings>(loadAccentSettings())
const nativeThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const native = ref<NativeTheme>(nativeThemeQuery.matches ? 'dark' : 'light')
const active = computed<Theme>(() => {
	const selectedTheme = preview.value ?? preferred.value
	if (selectedTheme !== 'system') {
		return selectedTheme
	}

	return native.value === 'light' ? 'light' : preferredDark.value
})

nativeThemeQuery.addEventListener('change', (event) => {
	native.value = event.matches ? 'dark' : 'light'
})

function applyAccent(): void {
	const root = document.documentElement
	root.classList.toggle('accent-rainbow', accent.mode === 'rainbow')
	root.classList.toggle('accent-duotone', accent.mode === 'duotone')
	root.style.setProperty('--portal-accent-primary', accent.primary)
	root.style.setProperty('--portal-accent-secondary', accent.secondary)
	if (accent.mode === 'rainbow') {
		root.style.setProperty('--color-brand', 'hsl(var(--portal-accent-hue) 78% 58%)')
		root.style.setProperty('--color-brand-highlight', 'hsl(var(--portal-accent-hue) 78% 58% / 0.2)')
		root.style.setProperty('--color-brand-shadow', 'hsl(var(--portal-accent-hue) 78% 58% / 0.35)')
	} else {
		root.style.setProperty('--color-brand', accent.primary)
		root.style.setProperty(
			'--color-brand-highlight',
			accent.mode === 'duotone'
				? `color-mix(in srgb, ${accent.primary} 55%, ${accent.secondary})`
				: `color-mix(in srgb, ${accent.primary} 20%, transparent)`,
		)
		root.style.setProperty(
			'--color-brand-shadow',
			`color-mix(in srgb, ${accent.primary} 35%, transparent)`,
		)
	}
}

watch(
	accent,
	(value) => {
		applyAccent()
		try {
			window.localStorage.setItem(ACCENT_SETTINGS_KEY, JSON.stringify(value))
		} catch {
			// storage blocked or full
		}
	},
	{ deep: true, immediate: true },
)

watch([preferred, preview], ([selectedPreferred, selectedPreview]) => {
	const selectedTheme = selectedPreview ?? selectedPreferred
	if (isDarkTheme(selectedTheme)) {
		preferredDark.value = selectedTheme
	}
})

watch(
	preferred,
	(theme) => {
		try {
			window.localStorage.setItem(PREFERRED_THEME_KEY, theme)
		} catch {
			// storage blocked or full
		}
	},
	{ immediate: true },
)

watch(preferredDark, (theme) => {
	try {
		window.localStorage.setItem(PREFERRED_DARK_THEME_KEY, theme)
	} catch {
		// storage blocked or full
	}
})

watch(
	active,
	(theme, previousTheme) => {
		if (previousTheme && previousTheme !== theme) {
			prepareThemeColorTransition()
		}

		const html = document.documentElement
		for (const option of THEME_OPTIONS) {
			html.classList.remove(`${option}-mode`)
		}
		html.classList.add(`${theme}-mode`)
	},
	{ immediate: true },
)

function applyAccountAppearance(appearance: { auto: boolean; theme: string }): void {
	if (isDarkTheme(appearance.theme)) {
		preferredDark.value = appearance.theme
	}

	if (appearance.auto) {
		preferred.value = 'system'
		return
	}

	if ((THEME_OPTIONS as readonly string[]).includes(appearance.theme)) {
		preferred.value = appearance.theme as ColorTheme
	}
}

const theme = reactive({
	preferred,
	preview,
	preferredDark,
	active,
	native,
	syncAcrossDevices,
	advancedRendering,
	options: THEME_OPTIONS,
	accent,
	accentModes: ACCENT_MODES,
	applyAccountAppearance,
})

export function useTheme() {
	return theme
}
