import {
  defineComponent,
  h,
  inject,
  mergeProps,
  provide,
  toRef,
  useId,
  type Component,
  type ComponentObjectPropsOptions,
  type PropType,
  type Ref,
} from 'vue';
import { RouterLink } from 'vue-router';

type UiColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'purple' | 'default' | string;
type UiVariant = 'flat' | 'filled' | 'outlined' | 'tonal' | 'text' | 'plain' | string;
type UiSelectItem = string | number | { title?: string; value?: string | number | boolean };

function primitive(
  name: string,
  tag: string,
  baseClass: string,
  props: ComponentObjectPropsOptions = {},
  classNames: (props: Record<string, unknown>) => Array<string | false | null | undefined> = () => [],
  styleFor: (props: Record<string, unknown>) => Record<string, string | number> | undefined = () => undefined,
): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    props,
    setup(componentProps, { attrs, slots }) {
      return () => h(tag, mergeProps(attrs, {
        class: [baseClass, ...classNames(componentProps as Record<string, unknown>)],
        style: styleFor(componentProps as Record<string, unknown>),
      }), slots.default?.());
    },
  });
}

const commonColorProps = {
  color: { type: String as PropType<UiColor>, default: undefined },
};
const commonVariantProps = {
  variant: { type: String as PropType<UiVariant>, default: undefined },
};

export const UiApp = primitive('UiApp', 'div', 'ui-app');
export const UiMain = primitive('UiMain', 'div', 'ui-main');
export const UiFooter = primitive('UiFooter', 'footer', 'ui-footer', {
  color: String,
  border: [String, Boolean],
});
export const UiAppBar = primitive('UiAppBar', 'header', 'ui-app-bar', {
  flat: Boolean,
  height: { type: [String, Number], default: undefined },
  color: String,
}, (props) => [props.flat ? 'ui-app-bar--flat' : undefined], (props) => props.height === undefined ? undefined : ({ minHeight: `${props.height}px` }));

export const UiContainer = primitive('UiContainer', 'div', 'ui-container', {
  maxWidth: { type: [String, Number], default: undefined },
  fluid: Boolean,
}, (props) => [props.fluid ? 'ui-container--fluid' : undefined], (props) => {
  const value = props.maxWidth;
  return value === undefined ? undefined : { maxWidth: cssLength(value) };
});

export const UiRow = primitive('UiRow', 'div', 'ui-row', {
  dense: Boolean,
  align: { type: String, default: undefined },
  justify: { type: String, default: undefined },
}, (props) => [props.dense ? 'ui-row--dense' : undefined], (props) => {
  const align = String(props.align ?? '');
  const justify = String(props.justify ?? '');
  const alignMap: Record<string, string> = { start: 'start', center: 'center', end: 'end', stretch: 'stretch', baseline: 'baseline' };
  const justifyMap: Record<string, string> = { start: 'start', center: 'center', end: 'end', 'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly' };
  const style: Record<string, string> = {};
  if (alignMap[align]) style.alignItems = alignMap[align]!;
  if (justifyMap[justify]) style.justifyContent = justifyMap[justify]!;
  return style;
});

export const UiCol = primitive('UiCol', 'div', 'ui-col', {
  cols: { type: [String, Number], default: 12 },
  md: { type: [String, Number], default: undefined },
  lg: { type: [String, Number], default: undefined },
}, (props) => [
  props.md !== undefined ? 'ui-col--has-md' : undefined,
  props.lg !== undefined ? 'ui-col--has-lg' : undefined,
], (props) => ({
  '--ui-col-span': String(props.cols ?? 12),
  ...(props.md !== undefined ? { '--ui-col-md': String(props.md) } : {}),
  ...(props.lg !== undefined ? { '--ui-col-lg': String(props.lg) } : {}),
}));

export const UiCard = primitive('UiCard', 'section', 'ui-card', {
  ...commonColorProps,
  ...commonVariantProps,
  rounded: { type: [String, Boolean], default: undefined },
  height: { type: [String, Number], default: undefined },
  elevation: { type: [String, Number], default: undefined },
}, (props) => [
  `ui-card--${String(props.variant ?? 'outlined')}`,
  props.color ? `ui-card--${String(props.color)}` : undefined,
  props.rounded === false ? 'ui-card--square' : undefined,
], (props) => props.height === undefined ? undefined : ({ height: typeof props.height === 'number' ? `${props.height}px` : String(props.height) }));
export const UiCardText = primitive('UiCardText', 'div', 'ui-card-text');
export const UiCardTitle = primitive('UiCardTitle', 'div', 'ui-card-title');
export const UiCardSubtitle = primitive('UiCardSubtitle', 'div', 'ui-card-subtitle');
export const UiCardActions = primitive('UiCardActions', 'div', 'ui-card-actions');
export const UiSheet = primitive('UiSheet', 'div', 'ui-sheet', {
  ...commonColorProps,
  rounded: { type: [String, Boolean], default: undefined },
}, (props) => [props.color ? `ui-sheet--${String(props.color)}` : undefined]);

export const UiButton = defineComponent({
  name: 'UiButton',
  inheritAttrs: false,
  emits: ['click'],
  props: {
    to: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    ...commonColorProps,
    ...commonVariantProps,
    size: { type: String, default: 'default' },
    rounded: { type: [String, Boolean], default: undefined },
    block: Boolean,
    disabled: Boolean,
    active: Boolean,
    icon: Boolean,
    loading: Boolean,
    prependIcon: { type: String, default: undefined },
    appendIcon: { type: String, default: undefined },
    value: { type: [String, Number, Boolean], default: undefined },
    type: { type: String, default: 'button' },
  },
  setup(props, { attrs, slots, emit }) {
    const toggle = inject<ButtonToggleContext | null>(buttonToggleKey, null);
    const renderIcon = (name: string, position: 'start' | 'end') => h('span', {
      class: ['mdi', mdiClass(name), 'ui-button__icon', `ui-button__icon--${position}`],
      'aria-hidden': 'true',
    });

    return () => {
      const isToggleActive = toggle !== null && props.value !== undefined && toggle.modelValue.value === props.value;
      const active = props.active || isToggleActive;
      const classes = [
        'ui-button',
        `ui-button--${String(props.variant ?? 'flat')}`,
        `ui-button--size-${props.size}`,
        props.color ? `ui-button--${String(props.color)}` : undefined,
        props.block ? 'ui-button--block' : undefined,
        props.icon ? 'ui-button--icon-only' : undefined,
        active ? 'ui-button--active' : undefined,
        props.disabled ? 'ui-button--disabled' : undefined,
        props.rounded === false ? 'ui-button--square' : undefined,
      ];
      const children = props.icon && slots.default === undefined
        ? []
        : [props.prependIcon ? renderIcon(props.prependIcon, 'start') : null, ...(slots.default?.() ?? []), props.appendIcon ? renderIcon(props.appendIcon, 'end') : null];
      const onClick = (event: MouseEvent) => {
        if (props.disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (toggle && props.value !== undefined) toggle.select(props.value);
        emit('click', event);
      };
      const common = mergeProps(attrs, {
        class: classes,
        onClick,
        'aria-pressed': toggle && props.value !== undefined ? String(isToggleActive) : attrs['aria-pressed'],
      });
      if (props.to !== undefined) {
        return h(RouterLink as unknown as Component, mergeProps(common, { to: props.to }), { default: () => children });
      }
      return h('button', mergeProps(common, {
        type: props.type,
        disabled: props.disabled || props.loading,
      }), children);
    };
  },
});

function cssLength(value: unknown): string {
  const normalized = String(value);
  return typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(normalized) ? `${normalized}px` : normalized;
}

function mdiClass(name: string): string {
  return name.startsWith('mdi-') ? name : `mdi-${name}`;
}
function slotText(nodes: unknown[]): string {
  return nodes.map((node) => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (node && typeof node === 'object' && 'children' in node) {
      const children = (node as { children?: unknown }).children;
      return typeof children === 'string' ? children : Array.isArray(children) ? slotText(children) : '';
    }
    return '';
  }).join('').trim();
}

export const UiIcon = defineComponent({
  name: 'UiIcon',
  inheritAttrs: false,
  props: {
    icon: { type: String, default: undefined },
    size: { type: [String, Number], default: undefined },
    color: { type: String, default: undefined },
    start: Boolean,
  },
  setup(props, { attrs, slots }) {
    return () => {
      const name = props.icon ?? slotText(slots.default?.() ?? []);
      const style: Record<string, string> = {};
      if (props.size !== undefined) style.fontSize = cssLength(props.size);
      if (props.color) style.color = colorValue(props.color);
      return h('span', mergeProps(attrs, {
        class: ['mdi', mdiClass(name), 'ui-icon', props.start ? 'ui-icon--start' : undefined, props.color ? `text-${props.color}` : undefined],
        style,
        'aria-hidden': attrs['aria-hidden'] ?? 'true',
      }));
    };
  },
});

function colorValue(color: string): string {
  if (color === 'purple') return '#a78bfa';
  return `var(--rx-color-${color === 'default' ? 'text' : color}, currentColor)`;
}

export const UiChip = primitive('UiChip', 'span', 'ui-chip', {
  ...commonColorProps,
  ...commonVariantProps,
  size: { type: String, default: 'default' },
}, (props) => [
  `ui-chip--${String(props.variant ?? 'tonal')}`,
  `ui-chip--size-${String(props.size)}`,
  props.color ? `ui-chip--${String(props.color)}` : undefined,
]);
export const UiDivider = primitive('UiDivider', 'div', 'ui-divider', {
  vertical: Boolean,
  inset: Boolean,
}, (props) => [props.vertical ? 'ui-divider--vertical' : 'ui-divider--horizontal', props.inset ? 'ui-divider--inset' : undefined]);
export const UiAlert = primitive('UiAlert', 'div', 'ui-alert', {
  type: { type: String, default: 'info' },
  ...commonVariantProps,
  density: { type: String, default: undefined },
}, (props) => [`ui-alert--${String(props.type)}`, `ui-alert--${String(props.variant ?? 'tonal')}`]);
export const UiAvatar = primitive('UiAvatar', 'span', 'ui-avatar', {
  ...commonColorProps,
  ...commonVariantProps,
  size: { type: [String, Number], default: undefined },
}, (props) => [props.color ? `ui-avatar--${String(props.color)}` : undefined], (props) => props.size === undefined ? undefined : {
  width: cssLength(props.size),
  height: cssLength(props.size),
});

export const UiExpansionPanels = primitive('UiExpansionPanels', 'div', 'ui-expansion-panels', {
  ...commonVariantProps,
  multiple: Boolean,
});
export const UiExpansionPanel = defineComponent({
  name: 'UiExpansionPanel',
  inheritAttrs: false,
  props: {
    title: { type: String, default: '' },
    disabled: Boolean,
    open: Boolean,
  },
  setup(props, { attrs, slots }) {
    return () => h('details', mergeProps(attrs, {
      class: ['ui-expansion-panel', props.disabled ? 'ui-expansion-panel--disabled' : undefined],
      open: props.open,
    }), [
      h('summary', { class: 'ui-expansion-panel__title' }, props.title),
      h('div', { class: 'ui-expansion-panel__content' }, slots.default?.()),
    ]);
  },
});
export const UiExpansionPanelText = primitive('UiExpansionPanelText', 'div', 'ui-expansion-panel-text');

export const UiTable = defineComponent({
  name: 'UiTable',
  inheritAttrs: false,
  props: { density: { type: String, default: 'default' } },
  setup(props, { attrs, slots }) {
    return () => h('div', mergeProps(attrs, { class: ['ui-table', `ui-table--${props.density}`] }), [h('table', { class: 'ui-table__table' }, slots.default?.())]);
  },
});
export const UiList = primitive('UiList', 'ul', 'ui-list', {
  density: { type: String, default: 'default' },
  nav: Boolean,
}, (props) => [props.nav ? 'ui-list--nav' : undefined, `ui-list--${String(props.density)}`]);

const UiListItemTitleImpl = primitive('UiListItemTitle', 'span', 'ui-list-item__title');
export const UiListItemTitle = UiListItemTitleImpl;
export const UiListSubheader = primitive('UiListSubheader', 'li', 'ui-list-subheader');

interface ButtonToggleContext {
  modelValue: Ref<unknown>;
  select: (value: unknown) => void;
}
const buttonToggleKey = Symbol('ui-button-toggle');

export const UiButtonToggle = defineComponent({
  name: 'UiButtonToggle',
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number, Boolean], default: undefined },
    color: { type: String, default: undefined },
    density: { type: String, default: undefined },
    mandatory: Boolean,
    variant: { type: String, default: undefined },
  },
  emits: ['update:modelValue', 'update:model-value'],
  setup(props, { attrs, slots, emit }) {
    const select = (value: unknown) => {
      if (props.mandatory && props.modelValue === value) return;
      emit('update:modelValue', value);
    };
    provide(buttonToggleKey, { modelValue: toRef(props, 'modelValue'), select } satisfies ButtonToggleContext);
    return () => h('div', mergeProps(attrs, { class: 'ui-button-toggle', role: 'group' }), slots.default?.());
  },
});

export const UiListItem = defineComponent({
  name: 'UiListItem',
  inheritAttrs: false,
  props: {
    to: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    active: Boolean,
    title: { type: String, default: undefined },
    subtitle: { type: String, default: undefined },
    prependIcon: { type: String, default: undefined },
    rounded: { type: [String, Boolean], default: undefined },
    color: { type: String, default: undefined },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const classes = ['ui-list-item', props.active ? 'ui-list-item--active' : undefined, props.rounded ? `ui-list-item--rounded-${String(props.rounded)}` : undefined, props.color ? `ui-list-item--${props.color}` : undefined];
      const content = [
        props.prependIcon ? h('span', { class: ['mdi', mdiClass(props.prependIcon), 'ui-list-item__icon'], 'aria-hidden': 'true' }) : null,
        h('span', { class: 'ui-list-item__content' }, slots.default?.() ?? [
          props.title ? h('span', { class: 'ui-list-item__title' }, props.title) : null,
          props.subtitle ? h('span', { class: 'ui-list-item__subtitle' }, props.subtitle) : null,
        ]),
      ];
      if (props.to !== undefined) {
        return h('li', { class: 'ui-list-item-shell' }, [h(RouterLink as unknown as Component, mergeProps(attrs, { to: props.to, class: [...classes, 'ui-list-item--link'], activeClass: 'ui-list-item--active' }), { default: () => content })]);
      }
      return h('li', mergeProps(attrs, { class: classes }), content);
    };
  },
});

export const UiSelect = defineComponent({
  name: 'UiSelect',
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number, Boolean], default: undefined },
    items: { type: Array as PropType<UiSelectItem[]>, default: () => [] },
    label: { type: String, default: undefined },
    itemTitle: { type: String, default: 'title' },
    itemValue: { type: String, default: 'value' },
    hideDetails: Boolean,
    disabled: Boolean,
    density: { type: String, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    const id = `ui-select-${useId()}`;
    const getItemTitle = (item: UiSelectItem): string => typeof item === 'object' ? String(item[props.itemTitle as keyof typeof item] ?? item.title ?? item.value ?? '') : String(item);
    const getItemValue = (item: UiSelectItem): string => typeof item === 'object' ? String(item[props.itemValue as keyof typeof item] ?? item.value ?? item.title ?? '') : String(item);
    return () => {
      const { class: wrapperClass, style: wrapperStyle, ...controlAttrs } = attrs;
      return h('label', { class: ['ui-field', 'ui-field--select', props.hideDetails ? 'ui-field--hide-details' : undefined, wrapperClass], style: wrapperStyle }, [
      props.label ? h('span', { class: 'ui-field__label' }, props.label) : null,
      h('select', mergeProps(controlAttrs, {
        id,
        class: 'ui-field__control',
        value: props.modelValue === undefined ? '' : String(props.modelValue),
        disabled: props.disabled,
        onChange: (event: Event) => {
          const target = event.target as HTMLSelectElement;
          const selected = props.items.find((item) => getItemValue(item) === target.value);
          emit('update:modelValue', selected === undefined ? target.value : (typeof selected === 'object' ? selected[props.itemValue as keyof typeof selected] ?? target.value : selected));
        },
      }), [
        ...props.items.map((item) => h('option', { key: getItemValue(item), value: getItemValue(item) }, getItemTitle(item))),
      ]),
      ]);
    };
  },
});

export const UiTextField = defineComponent({
  name: 'UiTextField',
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number], default: '' },
    label: { type: String, default: undefined },
    type: { type: String, default: 'text' },
    disabled: Boolean,
    hideDetails: Boolean,
    density: { type: String, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    const id = `ui-input-${useId()}`;
    return () => {
      const { class: wrapperClass, style: wrapperStyle, ...controlAttrs } = attrs;
      return h('label', { class: ['ui-field', 'ui-field--text', props.hideDetails ? 'ui-field--hide-details' : undefined, wrapperClass], style: wrapperStyle }, [
      props.label ? h('span', { class: 'ui-field__label' }, props.label) : null,
      h('input', mergeProps(controlAttrs, {
        id,
        class: 'ui-field__control',
        type: props.type,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) => {
          const value = (event.target as HTMLInputElement).value;
          emit('update:modelValue', props.type === 'number' && value !== '' ? Number(value) : value);
        },
      })),
      ]);
    };
  },
});

export const UiSwitch = defineComponent({
  name: 'UiSwitch',
  inheritAttrs: false,
  props: {
    modelValue: Boolean,
    label: { type: String, default: '' },
    disabled: Boolean,
    hideDetails: Boolean,
    color: { type: String, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('label', mergeProps(attrs, { class: ['ui-switch', props.disabled ? 'ui-switch--disabled' : undefined] }), [
      h('input', {
        class: 'ui-switch__input',
        type: 'checkbox',
        checked: props.modelValue,
        disabled: props.disabled,
        onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
      }),
      h('span', { class: 'ui-switch__track', 'aria-hidden': 'true' }, [h('span', { class: 'ui-switch__thumb' })]),
      h('span', { class: 'ui-switch__label' }, props.label),
    ]);
  },
});

export const UiSlider = defineComponent({
  name: 'UiSlider',
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: 0 },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    step: { type: Number, default: 1 },
    disabled: Boolean,
    hideDetails: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => {
      const { class: wrapperClass, style: wrapperStyle, ...inputAttrs } = attrs;
      return h('div', { class: ['ui-slider', wrapperClass], style: wrapperStyle }, [
      h('input', mergeProps(inputAttrs, {
        class: 'ui-slider__input',
        type: 'range',
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value)),
      })),
      ]);
    };
  },
});

export const UiLabel = primitive('UiLabel', 'label', 'ui-label');

export const UiProgressLinear = defineComponent({
  name: 'UiProgressLinear',
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: 0 },
    color: { type: String, default: 'primary' },
    height: { type: [String, Number], default: 6 },
    rounded: Boolean,
  },
  setup(props, { attrs }) {
    return () => h('div', mergeProps(attrs, {
      class: ['ui-progress', props.rounded ? 'ui-progress--rounded' : undefined, `ui-progress--${props.color}`],
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.max(0, Math.min(100, props.modelValue)),
      style: { height: `${props.height}px` },
    }), [h('span', { class: 'ui-progress__bar', style: { width: `${Math.max(0, Math.min(100, props.modelValue))}%` } })]);
  },
});

export const UiComponents = {
  UiApp, UiMain, UiFooter, UiAppBar, UiContainer, UiRow, UiCol,
  UiCard, UiCardText, UiCardTitle, UiCardSubtitle, UiCardActions, UiSheet,
  UiButton, UiIcon, UiChip, UiDivider, UiAlert, UiAvatar,
  UiExpansionPanels, UiExpansionPanel, UiExpansionPanelText, UiTable,
  UiList, UiListItem, UiListItemTitle, UiListSubheader, UiButtonToggle,
  UiSelect, UiTextField, UiSwitch, UiSlider, UiLabel, UiProgressLinear,
};
