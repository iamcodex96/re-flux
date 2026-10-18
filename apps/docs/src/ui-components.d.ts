import type { UiComponents } from './components/ui/UiPrimitives';

declare module 'vue' {
  export interface GlobalComponents {
    UiApp: typeof UiComponents.UiApp;
    UiMain: typeof UiComponents.UiMain;
    UiFooter: typeof UiComponents.UiFooter;
    UiAppBar: typeof UiComponents.UiAppBar;
    UiContainer: typeof UiComponents.UiContainer;
    UiRow: typeof UiComponents.UiRow;
    UiCol: typeof UiComponents.UiCol;
    UiCard: typeof UiComponents.UiCard;
    UiCardText: typeof UiComponents.UiCardText;
    UiCardTitle: typeof UiComponents.UiCardTitle;
    UiCardSubtitle: typeof UiComponents.UiCardSubtitle;
    UiCardActions: typeof UiComponents.UiCardActions;
    UiSheet: typeof UiComponents.UiSheet;
    UiButton: typeof UiComponents.UiButton;
    UiIcon: typeof UiComponents.UiIcon;
    UiChip: typeof UiComponents.UiChip;
    UiDivider: typeof UiComponents.UiDivider;
    UiAlert: typeof UiComponents.UiAlert;
    UiAvatar: typeof UiComponents.UiAvatar;
    UiExpansionPanels: typeof UiComponents.UiExpansionPanels;
    UiExpansionPanel: typeof UiComponents.UiExpansionPanel;
    UiExpansionPanelText: typeof UiComponents.UiExpansionPanelText;
    UiTable: typeof UiComponents.UiTable;
    UiList: typeof UiComponents.UiList;
    UiListItem: typeof UiComponents.UiListItem;
    UiListItemTitle: typeof UiComponents.UiListItemTitle;
    UiListSubheader: typeof UiComponents.UiListSubheader;
    UiButtonToggle: typeof UiComponents.UiButtonToggle;
    UiSelect: typeof UiComponents.UiSelect;
    UiTextField: typeof UiComponents.UiTextField;
    UiSwitch: typeof UiComponents.UiSwitch;
    UiSlider: typeof UiComponents.UiSlider;
    UiLabel: typeof UiComponents.UiLabel;
    UiProgressLinear: typeof UiComponents.UiProgressLinear;
  }
}

export {};
