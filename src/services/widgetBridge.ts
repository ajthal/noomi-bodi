import { NativeModules, Platform } from 'react-native';

const SharedGroupPreferences = NativeModules.SharedGroupPreferences;

const SUITE_NAME = 'group.noomibodi';

export interface WidgetData {
  date: string;
  caloriesConsumed: number;
  caloriesGoal: number;
  proteinConsumed: number;
  proteinGoal: number;
  carbsConsumed: number;
  carbsGoal: number;
  fatConsumed: number;
  fatGoal: number;
}

export async function updateWidgetData(data: WidgetData): Promise<void> {
  if (Platform.OS !== 'ios') return;

  if (!SharedGroupPreferences) {
    console.warn('[Widget] SharedGroupPreferences native module not found');
    return;
  }

  try {
    await SharedGroupPreferences.set(SUITE_NAME, 'widgetData', JSON.stringify(data));
    await SharedGroupPreferences.reloadWidgets();
  } catch (error) {
    console.error('Failed to update widget data:', error);
  }
}

export function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
