// tests/test-helpers.js
export const cartActions = {
  async addProductToCart(page, productName) {
    await page.getByRole('link', { name: productName }).click();
    await page.getByRole('button', { name: 'Add to Cart' }).click();
  },

  async viewCart(page) {
    await page.getByRole('link', { name: 'View Cart' }).click();
  },

  async removeProductFromCart(page) {
    await page.getByRole('button', { name: 'Remove' }).click();
  },
};