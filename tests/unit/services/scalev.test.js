import { describe, it, expect, vi } from 'vitest';
import { ScalevService } from '../../../server/services/scalev.js';

describe('ScalevService', () => {
  const mockSettingsRepo = {
    getCredentials: vi.fn(),
  };

  const service = new ScalevService(mockSettingsRepo);

  it('should create a ScalevService instance with settings repo', () => {
    expect(service).toBeInstanceOf(ScalevService);
    expect(service.settingsRepo).toBe(mockSettingsRepo);
  });

  it('should throw error when API token is not configured', () => {
    mockSettingsRepo.getCredentials.mockReturnValue(null);

    expect(() => service._getConfig()).toThrow('Scalev API token not configured');
  });

  it('should get config with API token', () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'scalev_token_123',
      store_url: 'https://mystore.scalev.id',
    });

    const config = service._getConfig();

    expect(config.token).toBe('scalev_token_123');
    expect(config.storeUrl).toBe('https://mystore.scalev.id');
  });

  it('should handle missing store URL', () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'scalev_token_123',
    });

    const config = service._getConfig();

    expect(config.token).toBe('scalev_token_123');
    expect(config.storeUrl).toBeNull();
  });

  it('should list products successfully', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    const mockProductsResponse = {
      code: 200,
      data: {
        results: [
          { id: 'prod_1', name: 'Product 1', price: 99000 },
          { id: 'prod_2', name: 'Product 2', price: 149000 },
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockProductsResponse,
    });

    const products = await service.listProducts();

    expect(products).toHaveLength(2);
    expect(products[0].name).toBe('Product 1');
    expect(products[1].price).toBe(149000);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.scalev.id/v2/products',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test_token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should handle products without results wrapper', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    const mockResponse = {
      code: 200,
      data: [
        { id: 'prod_3', name: 'Product 3' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockResponse,
    });

    const products = await service.listProducts();

    expect(products).toHaveLength(1);
    expect(products[0].id).toBe('prod_3');
  });

  it('should create an order successfully', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    const mockOrderResponse = {
      code: 201,
      data: {
        id: 'order_123',
        checkout_url: 'https://checkout.scalev.id/order_123',
        total_amount: 99000,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockOrderResponse,
    });

    const order = await service.createOrder({
      storeUniqueId: 'store_abc',
      customerName: 'John Doe',
      customerPhone: '08123456789',
      customerEmail: 'john@example.com',
      variantUniqueId: 'variant_123',
      quantity: 2,
      paymentMethod: 'invoice',
    });

    expect(order.id).toBe('order_123');
    expect(order.checkout_url).toContain('checkout.scalev.id');

    const fetchCallArgs = fetch.mock.calls[0];
    expect(fetchCallArgs[0]).toBe('https://api.scalev.id/v2/orders');

    const requestBody = JSON.parse(fetchCallArgs[1].body);
    expect(requestBody.store_unique_id).toBe('store_abc');
    expect(requestBody.customer_name).toBe('John Doe');
    expect(requestBody.ordervariants).toHaveLength(1);
    expect(requestBody.ordervariants[0].quantity).toBe(2);
  });

  it('should use default quantity of 1', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ code: 201, data: {} }),
    });

    await service.createOrder({
      storeUniqueId: 'store_abc',
      customerName: 'Jane Doe',
      customerPhone: '08987654321',
      customerEmail: 'jane@example.com',
      variantUniqueId: 'variant_456',
    });

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.ordervariants[0].quantity).toBe(1);
  });

  it('should use default payment method of invoice', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ code: 201, data: {} }),
    });

    await service.createOrder({
      storeUniqueId: 'store_abc',
      customerName: 'Test',
      customerPhone: '08123456789',
      customerEmail: 'test@example.com',
      variantUniqueId: 'variant_789',
    });

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.payment_method).toBe('invoice');
  });

  it('should get embed URL with custom store URL', () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
      store_url: 'https://custom.scalev.id',
    });

    const embedUrl = service.getEmbedUrl('mystore', 'checkout-page');

    expect(embedUrl).toBe('https://custom.scalev.id/checkout-page');
  });

  it('should get embed URL with default scalev domain', () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    const embedUrl = service.getEmbedUrl('mystore', 'product-page');

    expect(embedUrl).toBe('https://mystore.myscalev.com/product-page');
  });

  it('should handle empty page slug', () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
      store_url: 'https://custom.scalev.id',
    });

    const embedUrl = service.getEmbedUrl('mystore', '');

    expect(embedUrl).toBe('https://custom.scalev.id/');
  });

  it('should check connection successfully', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'valid_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ code: 200, data: { results: [] } }),
    });

    const result = await service.checkConnection();

    expect(result.connected).toBe(true);
  });

  it('should check connection with error', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'invalid_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 401,
        status: 'Unauthorized',
      }),
    });

    const result = await service.checkConnection();

    expect(result.connected).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should handle network errors in checkConnection', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.checkConnection();

    expect(result.connected).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('should throw error on API error response', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 400,
        status: 'Bad Request',
        message: 'Invalid parameters',
      }),
    });

    await expect(service.listProducts()).rejects.toThrow('Scalev API error');
  });

  it('should handle 201 success code', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      api_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ code: 201, data: { success: true } }),
    });

    await expect(service.listProducts()).resolves.not.toThrow();
  });
});
