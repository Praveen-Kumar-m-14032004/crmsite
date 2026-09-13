-- =====================================================================
-- Permit Declaration Clone — Database Schema + Seed Data
-- For: XAMPP (MySQL/MariaDB) via phpMyAdmin
-- Import: phpMyAdmin -> Import -> choose this file -> Go
--         (or via CLI: mysql -u root -p < schema.sql)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS permit_declaration
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE permit_declaration;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. ROLES & PERMISSIONS (RBAC)
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255),
  is_system TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL
);

CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'Admin',        'Full control of the system, users, roles and company settings', 1),
  (2, 'Accountant',   'Runs day-to-day invoicing and payments',                        1),
  (3, 'Sales',        'Onboards customers, read-only on invoices',                     1),
  (4, 'Viewer',       'Read-only oversight across all modules',                        1);

INSERT INTO permissions (code, module, action) VALUES
  ('customers.view',   'customers', 'view'),
  ('customers.create', 'customers', 'create'),
  ('customers.edit',   'customers', 'edit'),
  ('customers.delete', 'customers', 'delete'),

  ('products.view',    'products',  'view'),
  ('products.create',  'products',  'create'),
  ('products.edit',    'products',  'edit'),
  ('products.delete',  'products',  'delete'),

  ('invoices.view',    'invoices',  'view'),
  ('invoices.create',  'invoices',  'create'),
  ('invoices.edit',    'invoices',  'edit'),
  ('invoices.delete',  'invoices',  'delete'),
  ('invoices.print',   'invoices',  'print'),

  ('reports.view',     'reports',   'view'),
  ('reports.export',   'reports',   'export'),

  ('users.manage',     'users',     'manage'),
  ('roles.manage',     'roles',     'manage'),
  ('settings.manage',  'settings',  'manage'),

  ('dashboard.view',   'dashboard', 'view');

-- Admin: every permission
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions;

-- Accountant: full invoices/products/customers (view+edit, no delete on customers),
-- reports view+export, dashboard view, no users/roles/settings
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 2, id FROM permissions WHERE code IN (
    'customers.view','customers.create','customers.edit',
    'products.view',
    'invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.print',
    'reports.view','reports.export',
    'dashboard.view'
  );

-- Sales: manage customers, view products, read-only invoices, view dashboard
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 3, id FROM permissions WHERE code IN (
    'customers.view','customers.create','customers.edit',
    'products.view',
    'invoices.view',
    'dashboard.view'
  );

-- Viewer: view + export only, nothing else
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 4, id FROM permissions WHERE code IN (
    'customers.view',
    'products.view',
    'invoices.view',
    'reports.view','reports.export',
    'dashboard.view'
  );

-- ---------------------------------------------------------------------
-- 2. USERS
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(150),
  password VARCHAR(255) NOT NULL,   -- bcrypt hash
  role_id INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Seed admin user. Login: admin / admin
-- Password hash below is a real bcrypt hash of the plaintext "admin" (cost factor 10).
INSERT INTO users (name, username, email, password, role_id, is_active) VALUES
  ('System Admin', 'admin', 'admin@permitdeclaration.local',
   '$2b$10$/hJ9WIzr/Mqd5mJA80TWY.fyjwcJrvz8cFgNGG84PnZGOZbBp6zUa',
   1, 1);

-- ---------------------------------------------------------------------
-- 3. COMPANY SETTINGS (invoice letterhead)
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS company_settings;
CREATE TABLE company_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  address TEXT,
  tel VARCHAR(30),
  mobile VARCHAR(30),
  email VARCHAR(150),
  website VARCHAR(150),
  contact_no VARCHAR(30),
  uen VARCHAR(50),
  default_currency VARCHAR(10) DEFAULT 'SGD',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Letterhead seed row, editable any time from the Company Settings screen.
INSERT INTO company_settings
  (company_name, address, tel, mobile, email, website, contact_no, uen, default_currency)
VALUES
  ('Chola Logistics Pte Ltd',
   'Blk-640, Rowell Road, #01-54, Singapore 200640',
   '62917747', '96539713',
   'accounts@permitdeclaration.com.sg', 'www.permitdeclaration.com.sg',
   '+65 9014 4400', '201835067C', 'SGD');

-- ---------------------------------------------------------------------
-- 4. CUSTOMERS
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS customers;
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyname VARCHAR(150) NOT NULL,
  person_incharge VARCHAR(100),
  mobile_no VARCHAR(30),
  email VARCHAR(150),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_companyname (companyname)
);

INSERT INTO customers (companyname, person_incharge, mobile_no, email, address) VALUES
  ('APPAREL WORKS', 'MR. ADRIAN', '+65-98433879', 'adrian@apparelworkz.com.sg',
   'BLK 259, #11-342 TAMPINES STREET 21 Singapore 520259'),
  ('Centric Forwarding International Pte Ltd', 'Mr Noi', '+65 9127 6307', 'ops@centric.com.sg',
   '18 Boon Lay Way, #08-128 Tradehub 21, Singapore 619115');

-- ---------------------------------------------------------------------
-- 5. PRODUCTS (services)
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS products;
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productname VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (productname) VALUES
  ('GST'),
  ('IMPORT DECLARATION'),
  ('EXPORT DECLARATION'),
  ('CANCELLATION'),
  ('CARGO CLEARANCE AND TRANSPORTATION'),
  ('ITEM COST'),
  ('IMPORTER OF THE RECORD (USING CHOLA AS IMPORTER)'),
  ('LICENSE (USING CHOLA LICENSE)');

-- ---------------------------------------------------------------------
-- 6. INVOICES + LINE ITEMS
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;

CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(30) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  customer_id INT NOT NULL,
  customer_contact VARCHAR(30),
  sub_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_amount DECIMAL(12,2) DEFAULT 0,
  payment_type VARCHAR(30),
  payment_status VARCHAR(30),
  status VARCHAR(30) DEFAULT 'Pending',
  is_gst_bill TINYINT(1) DEFAULT 0,
  -- Bumped on every edit. updated_at can't serve as the concurrency token because
  -- TIMESTAMP only resolves to the second, so two saves in the same second look
  -- identical and a stale overwrite slips through.
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  -- invoice_date is the default sort on every list screen and the range filter
  -- on every report; without this the server filesorts the whole table per page.
  INDEX idx_invoices_date (invoice_date, id),
  INDEX idx_invoices_status (status),
  INDEX idx_invoices_payment_status (payment_status)
);

CREATE TABLE invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  description VARCHAR(255),
  rate DECIMAL(10,2) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Sample invoice matching the reference PDF (Centric Forwarding, total 68.50)
INSERT INTO invoices
  (invoice_no, invoice_date, customer_id, customer_contact,
   sub_amount, paid_amount, due_amount, payment_type, payment_status, status, is_gst_bill)
VALUES
  ('290', '2024-03-01', 2, '+65 9127 6307',
   68.50, 68.50, 0.00, 'Bank Transfer', 'Full Payment', 'Paid', 0);

SET @inv_id = LAST_INSERT_ID();

INSERT INTO invoice_items (invoice_id, product_id, description, rate, quantity, total) VALUES
  (@inv_id, (SELECT id FROM products WHERE productname = 'IMPORT DECLARATION'),                                'IG4B323358H', 15.00, 1, 15.00),
  (@inv_id, (SELECT id FROM products WHERE productname = 'ITEM COST'),                                         'IG4B323358H', 0.50,  7, 3.50),
  (@inv_id, (SELECT id FROM products WHERE productname = 'IMPORTER OF THE RECORD (USING CHOLA AS IMPORTER)'),  'IG4B323358H', 25.00, 1, 25.00),
  (@inv_id, (SELECT id FROM products WHERE productname = 'LICENSE (USING CHOLA LICENSE)'),                     'IG4B323358H', 25.00, 1, 25.00);

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Done. Verify with:
--   SELECT * FROM roles; SELECT * FROM users; SELECT * FROM invoices;
-- Login for the seeded admin account: username=admin / password=admin
-- =====================================================================
