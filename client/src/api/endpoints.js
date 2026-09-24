import api from './axios';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
};

export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
};

export const customersApi = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  remove: (id) => api.delete(`/customers/${id}`),
};

export const productsApi = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
};

export const invoicesApi = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  nextNumber: () => api.get('/invoices/next-number'),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  patchStatus: (id, status) => api.patch(`/invoices/${id}/status`, { status }),
  remove: (id) => api.delete(`/invoices/${id}`),
  restore: (id) => api.post(`/invoices/${id}/restore`),
  permanentDelete: (id) => api.delete(`/invoices/${id}/permanent`),
};

export const quotationsApi = {
  list: (params) => api.get('/quotations', { params }),
  get: (id) => api.get(`/quotations/${id}`),
  nextNumber: () => api.get('/quotations/next-number'),
  create: (data) => api.post('/quotations', data),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  remove: (id) => api.delete(`/quotations/${id}`),
  pdfUrl: (id) => `/api/quotations/${id}/pdf`,
};

export const reportsApi = {
  search: (params) => api.get('/reports', { params }),
};

export const rolesApi = {
  list: () => api.get('/roles'),
  create: (data) => api.post('/roles', data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  remove: (id) => api.delete(`/roles/${id}`),
};

export const permissionsApi = {
  list: () => api.get('/permissions'),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const settingsApi = {
  get: () => api.get('/company-settings'),
  update: (data) => api.put('/company-settings', data),
};
