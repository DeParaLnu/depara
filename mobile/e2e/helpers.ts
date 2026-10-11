// На Android testID з React Native потрапляє в resource-id, тому шукаємо через UiSelector.
export const byTestId = (id: string) =>
  $(`android=new UiSelector().resourceId("${id}")`);
