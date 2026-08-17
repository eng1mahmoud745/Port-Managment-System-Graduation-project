-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Dec 01, 2025 at 12:43 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `port_mng_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `inventory_items`
--

CREATE TABLE `inventory_items` (
  `item_id` int(11) NOT NULL,
  `item_code` varchar(50) DEFAULT NULL,
  `item_name` varchar(255) NOT NULL,
  `current_qty` decimal(10,2) NOT NULL DEFAULT 0.00,
  `unit` varchar(50) DEFAULT 'وحدة',
  `min_stock` decimal(10,2) DEFAULT 5.00,
  `location_id` int(11) DEFAULT NULL,
  `images` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `inventory_items`
--

INSERT INTO `inventory_items` (`item_id`, `item_code`, `item_name`, `current_qty`, `unit`, `min_stock`, `location_id`, `images`) VALUES
(1, 'mat12', 'براغي', 8.00, 'قطعة', 52.00, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `locations`
--

CREATE TABLE `locations` (
  `id` int(11) NOT NULL,
  `warehouse_id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `rack` varchar(100) DEFAULT NULL,
  `aisle` varchar(100) DEFAULT NULL,
  `level` varchar(100) DEFAULT NULL,
  `capacity` varchar(50) DEFAULT NULL,
  `status` enum('حر','مشغول','محجوز') NOT NULL DEFAULT 'حر',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `locations`
--

INSERT INTO `locations` (`id`, `warehouse_id`, `code`, `rack`, `aisle`, `level`, `capacity`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 'A-01-1', 'RACK-A-01', 'A', 'L1', '120', 'حر', '2025-11-14 21:29:25', '2025-11-14 21:29:25'),
(2, 1, 'B-02-2', 'RACK-B-02', 'B', 'L2', '80', 'مشغول', '2025-11-14 21:29:25', '2025-11-14 21:29:25'),
(3, 2, 'C-01-1', 'RACK-C-01', 'C', 'L1', '60', 'محجوز', '2025-11-14 21:29:25', '2025-11-14 22:00:39');

-- --------------------------------------------------------

--
-- Table structure for table `machines`
--

CREATE TABLE `machines` (
  `machine_id` int(11) NOT NULL,
  `machine_code` varchar(50) NOT NULL,
  `machine_name` varchar(255) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `location_id` varchar(100) DEFAULT NULL,
  `status` enum('جاهزة','تحت الصيانة','متوقفة','في الخدمة') NOT NULL DEFAULT 'جاهزة',
  `operating_hours` decimal(10,2) DEFAULT 0.00,
  `purchase_date` date DEFAULT NULL,
  `last_maintenance_date` date DEFAULT NULL,
  `next_maintenance_date` date DEFAULT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `facility_name` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `machines`
--

INSERT INTO `machines` (`machine_id`, `machine_code`, `machine_name`, `category`, `location_id`, `status`, `operating_hours`, `purchase_date`, `last_maintenance_date`, `next_maintenance_date`, `supplier_id`, `facility_name`, `notes`, `created_at`, `updated_at`) VALUES
(1, 'HM-1', 'Mach1', 'شاحنة', 'المرفق-1', 'تحت الصيانة', 3.00, '2025-11-02', '2025-11-09', '2025-11-16', 2, '1233', 'none', '2025-11-14 20:22:20', '2025-11-15 17:30:35'),
(2, 'HM-', 'Mach2', 'رافعة شوكية', 'المرفق-1', 'جاهزة', 44.00, '2025-11-04', '2025-11-27', '2025-11-29', 2, '12332', NULL, '2025-11-14 22:06:01', '2025-11-14 22:06:01');

-- --------------------------------------------------------

--
-- Table structure for table `maintenances`
--

CREATE TABLE `maintenances` (
  `maintenance_id` int(11) NOT NULL,
  `machine_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `type` varchar(255) DEFAULT NULL,
  `technician` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchases`
--

CREATE TABLE `purchases` (
  `id` int(11) NOT NULL,
  `supplier_id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `transaction_date` date NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `requests`
--

CREATE TABLE `requests` (
  `request_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `requested_by` varchar(100) NOT NULL,
  `status` enum('جديد','معتمد','مرفوض','تم الصرف') NOT NULL DEFAULT 'جديد',
  `justification` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `suppliers`
--

CREATE TABLE `suppliers` (
  `supplier_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `primary_phone` varchar(50) DEFAULT NULL,
  `rating` int(11) DEFAULT NULL CHECK (`rating` between 1 and 5),
  `category` varchar(100) DEFAULT NULL,
  `specialization` varchar(255) NOT NULL,
  `contact_person` varchar(255) NOT NULL,
  `secondary_phone` varchar(50) DEFAULT NULL,
  `address` text NOT NULL,
  `commercial_reg` varchar(100) DEFAULT NULL,
  `tax_number` varchar(100) DEFAULT NULL,
  `payment_terms` varchar(50) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `transactions` int(11) NOT NULL DEFAULT 0,
  `total_value` decimal(15,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `suppliers`
--

INSERT INTO `suppliers` (`supplier_id`, `name`, `email`, `primary_phone`, `rating`, `category`, `specialization`, `contact_person`, `secondary_phone`, `address`, `commercial_reg`, `tax_number`, `payment_terms`, `currency`, `status`, `transactions`, `total_value`) VALUES
(2, 'mohammed Ameen', 'omranadobe@gmail.com', '0988776655', 3, 'ثانوي', 'معدات الأمان', 'Hamed', '0988774433', 'none', '33333', '233345', 'صافي 90', 'USD', 'active', 0, 0.00);

-- --------------------------------------------------------

--
-- Table structure for table `transaction_log`
--

CREATE TABLE `transaction_log` (
  `transaction_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `type` enum('استلام','صرف','جرد موجب','جرد سالب') NOT NULL,
  `qty_change` decimal(10,2) NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `user` varchar(100) DEFAULT NULL,
  `attachment_paths` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `transaction_log`
--

INSERT INTO `transaction_log` (`transaction_id`, `item_id`, `type`, `qty_change`, `reference`, `user`, `attachment_paths`, `created_at`) VALUES
(1, 1, 'استلام', 8.00, 'استلام أولي عند الإضافة', 'مشرف', NULL, '2025-11-14 22:44:13');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `email`, `password`, `role`, `full_name`) VALUES
(1, 'admin1@gmail.com', '1234test', 'Admin', 'Mohamed Abo Aisha'),
(2, 'super1@gmail.com', '5678test', 'Supervisor', 'Yasser '),
(7, 'Omar@gmail.com', '3456test', 'mechanic', 'Omar');

-- --------------------------------------------------------

--
-- Table structure for table `warehouses`
--

CREATE TABLE `warehouses` (
  `id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `warehouse_type` varchar(100) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `status` enum('نشط','تحت الصيانة','مغلق') NOT NULL DEFAULT 'نشط',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `warehouses`
--

INSERT INTO `warehouses` (`id`, `code`, `name`, `location`, `status`, `created_at`, `updated_at`) VALUES
(1, 'WH-MAIN', 'المستودع المركزي', 'ميناء المدينة', 'نشط', '2025-11-14 21:29:03', '2025-11-14 21:29:03'),
(2, 'WH-02', 'مستودع الأدوات', 'القاعدة البحرية', 'تحت الصيانة', '2025-11-14 21:29:03', '2025-11-14 21:29:03');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `inventory_items`
--
ALTER TABLE `inventory_items`
  ADD PRIMARY KEY (`item_id`),
  ADD UNIQUE KEY `item_code` (`item_code`),
  ADD KEY `fk_item_location` (`location_id`);

--
-- Indexes for table `locations`
--
ALTER TABLE `locations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `warehouse_id` (`warehouse_id`,`code`);

--
-- Indexes for table `machines`
--
ALTER TABLE `machines`
  ADD PRIMARY KEY (`machine_id`),
  ADD UNIQUE KEY `machine_code` (`machine_code`),
  ADD KEY `supplier_id` (`supplier_id`);

--
-- Indexes for table `maintenances`
--
ALTER TABLE `maintenances`
  ADD PRIMARY KEY (`maintenance_id`),
  ADD KEY `machine_id` (`machine_id`);

--
-- Indexes for table `purchases`
--
ALTER TABLE `purchases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `supplier_id` (`supplier_id`),
  ADD KEY `fk_purchase_item` (`item_id`);

--
-- Indexes for table `requests`
--
ALTER TABLE `requests`
  ADD PRIMARY KEY (`request_id`),
  ADD KEY `item_id` (`item_id`);

--
-- Indexes for table `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`supplier_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `transaction_log`
--
ALTER TABLE `transaction_log`
  ADD PRIMARY KEY (`transaction_id`),
  ADD KEY `item_id` (`item_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `warehouses`
--
ALTER TABLE `warehouses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `inventory_items`
--
ALTER TABLE `inventory_items`
  MODIFY `item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `machines`
--
ALTER TABLE `machines`
  MODIFY `machine_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `maintenances`
--
ALTER TABLE `maintenances`
  MODIFY `maintenance_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `purchases`
--
ALTER TABLE `purchases`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `requests`
--
ALTER TABLE `requests`
  MODIFY `request_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `supplier_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `transaction_log`
--
ALTER TABLE `transaction_log`
  MODIFY `transaction_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `warehouses`
--
ALTER TABLE `warehouses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `inventory_items`
--
ALTER TABLE `inventory_items`
  ADD CONSTRAINT `fk_item_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `locations`
--
ALTER TABLE `locations`
  ADD CONSTRAINT `locations_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `machines`
--
ALTER TABLE `machines`
  ADD CONSTRAINT `machines_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE SET NULL;

--
-- Constraints for table `maintenances`
--
ALTER TABLE `maintenances`
  ADD CONSTRAINT `maintenances_ibfk_1` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`machine_id`) ON DELETE CASCADE;

--
-- Constraints for table `purchases`
--
ALTER TABLE `purchases`
  ADD CONSTRAINT `fk_purchase_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE;

--
-- Constraints for table `requests`
--
ALTER TABLE `requests`
  ADD CONSTRAINT `requests_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`);

--
-- Constraints for table `transaction_log`
--
ALTER TABLE `transaction_log`
  ADD CONSTRAINT `transaction_log_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
