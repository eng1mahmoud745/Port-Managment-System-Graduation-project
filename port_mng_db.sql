-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: 05 أبريل 2026 الساعة 15:51
-- إصدار الخادم: 10.4.32-MariaDB
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
-- بنية الجدول `dock_delivery_requests`
--

CREATE TABLE `dock_delivery_requests` (
  `request_id` int(11) NOT NULL,
  `slot_id` int(11) NOT NULL,
  `container_number` varchar(100) NOT NULL,
  `slot_code` varchar(30) NOT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `driver_user_id` int(11) NOT NULL,
  `status` enum('pending','approved','unavailable','completed','failed','delivered') NOT NULL DEFAULT 'pending',
  `response_note` varchar(255) DEFAULT NULL,
  `created_by_email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `responded_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `dock_slots`
--

CREATE TABLE `dock_slots` (
  `id` int(11) NOT NULL,
  `berth_key` varchar(10) NOT NULL DEFAULT 'A',
  `level_key` varchar(20) NOT NULL,
  `slot_code` varchar(30) NOT NULL,
  `slot_order` int(11) NOT NULL,
  `container_number` varchar(100) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `container_type` varchar(50) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `dock_slots`
--

INSERT INTO `dock_slots` (`id`, `berth_key`, `level_key`, `slot_code`, `slot_order`, `container_number`, `owner_name`, `container_type`, `notes`, `created_at`, `updated_at`) VALUES
(26, 'A', 'lower', 'A-LOW-08', 8, NULL, NULL, NULL, NULL, '2026-03-27 15:50:33', '2026-04-04 15:09:16'),
(27, 'A', 'lower', 'A-LOW-09', 9, NULL, NULL, NULL, NULL, '2026-03-27 15:50:33', '2026-04-04 15:09:16'),
(241, 'B', 'upper', 'B-UP-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(242, 'B', 'upper', 'B-UP-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(243, 'B', 'upper', 'B-UP-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(244, 'B', 'upper', 'B-UP-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(245, 'B', 'upper', 'B-UP-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(246, 'B', 'upper', 'B-UP-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(247, 'B', 'upper', 'B-UP-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(248, 'B', 'upper', 'B-UP-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(249, 'B', 'upper', 'B-UP-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(250, 'B', 'middle', 'B-MID-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(251, 'B', 'middle', 'B-MID-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(252, 'B', 'middle', 'B-MID-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(253, 'B', 'middle', 'B-MID-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(254, 'B', 'middle', 'B-MID-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(255, 'B', 'middle', 'B-MID-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(256, 'B', 'middle', 'B-MID-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(257, 'B', 'middle', 'B-MID-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(258, 'B', 'middle', 'B-MID-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(259, 'B', 'lower', 'B-LOW-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-05 13:19:53'),
(260, 'B', 'lower', 'B-LOW-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(261, 'B', 'lower', 'B-LOW-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(262, 'B', 'lower', 'B-LOW-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(263, 'B', 'lower', 'B-LOW-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(264, 'B', 'lower', 'B-LOW-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(265, 'B', 'lower', 'B-LOW-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(266, 'B', 'lower', 'B-LOW-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(267, 'B', 'lower', 'B-LOW-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(268, 'C', 'upper', 'C-UP-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(269, 'C', 'upper', 'C-UP-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(270, 'C', 'upper', 'C-UP-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(271, 'C', 'upper', 'C-UP-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(272, 'C', 'upper', 'C-UP-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(273, 'C', 'upper', 'C-UP-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(274, 'C', 'upper', 'C-UP-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(275, 'C', 'upper', 'C-UP-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(276, 'C', 'upper', 'C-UP-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(277, 'C', 'middle', 'C-MID-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(278, 'C', 'middle', 'C-MID-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(279, 'C', 'middle', 'C-MID-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(280, 'C', 'middle', 'C-MID-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(281, 'C', 'middle', 'C-MID-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(282, 'C', 'middle', 'C-MID-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(283, 'C', 'middle', 'C-MID-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(284, 'C', 'middle', 'C-MID-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(285, 'C', 'middle', 'C-MID-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(286, 'C', 'lower', 'C-LOW-01', 1, 'CNT-02', 'محمد ه', 'عادية 1', 'تم تنزيل الحاوية من الباخرة إلى رصيف C', '2026-04-04 15:09:16', '2026-04-05 13:28:45'),
(287, 'C', 'lower', 'C-LOW-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(288, 'C', 'lower', 'C-LOW-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(289, 'C', 'lower', 'C-LOW-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(290, 'C', 'lower', 'C-LOW-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(291, 'C', 'lower', 'C-LOW-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(292, 'C', 'lower', 'C-LOW-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(293, 'C', 'lower', 'C-LOW-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(294, 'C', 'lower', 'C-LOW-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 15:09:16', '2026-04-04 15:09:16'),
(295, 'TRUCK', 'lower', 'TRUCK-LOW-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 20:51:01', '2026-04-04 20:51:01'),
(296, 'TRAIN', 'lower', 'TRAIN-LOW-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 20:54:34', '2026-04-04 20:54:34'),
(297, 'TRAIN', 'lower', 'TRAIN-LOW-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 20:54:34', '2026-04-04 20:54:34'),
(298, 'TRAIN', 'lower', 'TRAIN-LOW-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 20:54:34', '2026-04-04 20:54:34'),
(302, 'TRAIN', 'lower', 'TRAIN-LOW-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(303, 'TRAIN', 'lower', 'TRAIN-LOW-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(304, 'TRAIN', 'lower', 'TRAIN-LOW-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(305, 'TRAIN', 'lower', 'TRAIN-LOW-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(306, 'TRAIN', 'lower', 'TRAIN-LOW-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(307, 'TRAIN', 'lower', 'TRAIN-LOW-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 20:58:04', '2026-04-04 20:58:04'),
(308, 'A', 'middle', 'A-MID-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(309, 'A', 'middle', 'A-MID-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(310, 'A', 'middle', 'A-MID-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(311, 'A', 'middle', 'A-MID-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(312, 'A', 'middle', 'A-MID-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(313, 'A', 'middle', 'A-MID-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(314, 'A', 'middle', 'A-MID-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(315, 'A', 'middle', 'A-MID-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(316, 'A', 'middle', 'A-MID-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(317, 'A', 'upper', 'A-UP-01', 1, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(318, 'A', 'upper', 'A-UP-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(319, 'A', 'upper', 'A-UP-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(320, 'A', 'upper', 'A-UP-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(321, 'A', 'upper', 'A-UP-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(322, 'A', 'upper', 'A-UP-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(323, 'A', 'upper', 'A-UP-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(324, 'A', 'upper', 'A-UP-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(325, 'A', 'upper', 'A-UP-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(327, 'TRUCK', 'lower', 'TRUCK-LOW-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(328, 'TRUCK', 'lower', 'TRUCK-LOW-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(329, 'TRUCK', 'lower', 'TRUCK-LOW-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(330, 'TRUCK', 'lower', 'TRUCK-LOW-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(331, 'TRUCK', 'lower', 'TRUCK-LOW-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(332, 'TRUCK', 'lower', 'TRUCK-LOW-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(333, 'TRUCK', 'lower', 'TRUCK-LOW-08', 8, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(334, 'TRUCK', 'lower', 'TRUCK-LOW-09', 9, NULL, NULL, NULL, NULL, '2026-04-04 20:58:43', '2026-04-04 20:58:43'),
(335, 'A', 'lower', 'A-LOW-01', 1, 'CNT-01', 'محمد', 'عادية', 'تم تنزيل الحاوية من الباخرة إلى رصيف A', '2026-04-04 20:59:08', '2026-04-05 13:27:42'),
(336, 'A', 'lower', 'A-LOW-02', 2, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09'),
(337, 'A', 'lower', 'A-LOW-03', 3, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09'),
(338, 'A', 'lower', 'A-LOW-04', 4, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09'),
(339, 'A', 'lower', 'A-LOW-05', 5, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09'),
(340, 'A', 'lower', 'A-LOW-06', 6, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09'),
(341, 'A', 'lower', 'A-LOW-07', 7, NULL, NULL, NULL, NULL, '2026-04-04 20:59:09', '2026-04-04 20:59:09');

-- --------------------------------------------------------

--
-- بنية الجدول `incoming_vessels`
--

CREATE TABLE `incoming_vessels` (
  `vessel_id` int(11) NOT NULL,
  `vessel_name` varchar(255) NOT NULL,
  `voyage_reference` varchar(100) NOT NULL,
  `expected_arrival` datetime NOT NULL,
  `proposed_berth` varchar(100) DEFAULT NULL,
  `arrival_source` varchar(255) DEFAULT NULL,
  `expected_container_count` int(11) NOT NULL DEFAULT 0,
  `arrival_shortage_reason` text DEFAULT NULL,
  `cargo_type` varchar(120) DEFAULT NULL,
  `discharge_priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `notes` text DEFAULT NULL,
  `status` enum('arriving','containers_added','discharge_planned','discharging','completed','cancelled','archived') NOT NULL DEFAULT 'arriving',
  `created_by_email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `incoming_vessels`
--

INSERT INTO `incoming_vessels` (`vessel_id`, `vessel_name`, `voyage_reference`, `expected_arrival`, `proposed_berth`, `arrival_source`, `expected_container_count`, `arrival_shortage_reason`, `cargo_type`, `discharge_priority`, `notes`, `status`, `created_by_email`, `created_at`, `updated_at`) VALUES
(8, 'HM', '520', '2026-04-07 16:21:00', NULL, 'saudia', 1, NULL, 'اوزان كبيرة', 'urgent', NULL, 'completed', 'mohamad2002269@gmail.com', '2026-04-05 13:21:12', '2026-04-05 13:28:45');

-- --------------------------------------------------------

--
-- بنية الجدول `incoming_vessel_containers`
--

CREATE TABLE `incoming_vessel_containers` (
  `id` int(11) NOT NULL,
  `vessel_id` int(11) NOT NULL,
  `container_number` varchar(100) NOT NULL,
  `container_type` varchar(100) DEFAULT NULL,
  `container_size` enum('20','40') NOT NULL,
  `container_condition` enum('sound','damaged','inspection') NOT NULL DEFAULT 'sound',
  `contents` varchar(255) DEFAULT NULL,
  `destination_type` enum('yard','truck','warehouse','berth_a','berth_b','berth_c') NOT NULL DEFAULT 'yard',
  `discharge_priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status` enum('arrived','scheduled','discharging','stored','loaded_truck','warehoused') NOT NULL DEFAULT 'arrived',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `final_location` varchar(255) DEFAULT NULL,
  `actual_unloaded_at` datetime DEFAULT NULL,
  `unloaded_by_driver_name` varchar(255) DEFAULT NULL,
  `unloaded_by_machine_name` varchar(255) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `container_weight` decimal(12,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `incoming_vessel_containers`
--

INSERT INTO `incoming_vessel_containers` (`id`, `vessel_id`, `container_number`, `container_type`, `container_size`, `container_condition`, `contents`, `destination_type`, `discharge_priority`, `status`, `created_at`, `updated_at`, `final_location`, `actual_unloaded_at`, `unloaded_by_driver_name`, `unloaded_by_machine_name`, `owner_name`, `container_weight`) VALUES
(11, 8, 'CNT-01', 'عادية', '20', 'sound', 'ليد', 'berth_a', 'normal', 'stored', '2026-04-05 13:21:52', '2026-04-05 13:27:42', 'A-LOW-01', '2026-04-05 16:27:42', 'alaaa', 'شاحنة', 'محمد', 10.00),
(12, 8, 'CNT-02', 'عادية 1', '40', 'sound', 'ليدات', 'berth_c', 'normal', 'stored', '2026-04-05 13:22:20', '2026-04-05 13:28:45', 'C-LOW-01', '2026-04-05 16:28:45', 'alaaa', 'شاحنة', 'محمد ه', 12.00);

-- --------------------------------------------------------

--
-- بنية الجدول `incoming_vessel_discharge_plans`
--

CREATE TABLE `incoming_vessel_discharge_plans` (
  `plan_id` int(11) NOT NULL,
  `vessel_id` int(11) NOT NULL,
  `proposed_berth` varchar(100) DEFAULT NULL,
  `status` enum('draft','active','completed','cancelled') NOT NULL DEFAULT 'draft',
  `generated_by_email` varchar(255) DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `incoming_vessel_discharge_plans`
--

INSERT INTO `incoming_vessel_discharge_plans` (`plan_id`, `vessel_id`, `proposed_berth`, `status`, `generated_by_email`, `generated_at`, `started_at`, `completed_at`, `notes`) VALUES
(10, 8, NULL, 'completed', 'mohamad2002269@gmail.com', '2026-04-05 13:26:51', '2026-04-05 16:27:18', '2026-04-05 16:28:45', 'تم توليد الخطة تلقائياً باستخدام 1 معدة بانتظار تعيين السائقين من مدير الآليات.');

-- --------------------------------------------------------

--
-- بنية الجدول `incoming_vessel_discharge_tasks`
--

CREATE TABLE `incoming_vessel_discharge_tasks` (
  `task_id` int(11) NOT NULL,
  `plan_id` int(11) NOT NULL,
  `vessel_id` int(11) NOT NULL,
  `container_id` int(11) NOT NULL,
  `container_number` varchar(100) NOT NULL,
  `destination_type` enum('yard','truck','warehouse','berth_a','berth_b','berth_c') NOT NULL,
  `initial_drop_location` varchar(255) DEFAULT NULL,
  `final_location` varchar(255) DEFAULT NULL,
  `driver_user_id` int(11) DEFAULT NULL,
  `driver_name_snapshot` varchar(255) DEFAULT NULL,
  `driver_response_status` enum('pending','accepted','busy','failed') NOT NULL DEFAULT 'pending',
  `driver_response_note` varchar(255) DEFAULT NULL,
  `driver_responded_at` datetime DEFAULT NULL,
  `machine_id` int(11) DEFAULT NULL,
  `machine_name_snapshot` varchar(255) DEFAULT NULL,
  `task_order` int(11) NOT NULL DEFAULT 1,
  `status` enum('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
  `actual_unloaded_at` datetime DEFAULT NULL,
  `actual_driver_name` varchar(255) DEFAULT NULL,
  `actual_machine_name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `incoming_vessel_discharge_tasks`
--

INSERT INTO `incoming_vessel_discharge_tasks` (`task_id`, `plan_id`, `vessel_id`, `container_id`, `container_number`, `destination_type`, `initial_drop_location`, `final_location`, `driver_user_id`, `driver_name_snapshot`, `driver_response_status`, `driver_response_note`, `driver_responded_at`, `machine_id`, `machine_name_snapshot`, `task_order`, `status`, `actual_unloaded_at`, `actual_driver_name`, `actual_machine_name`, `created_at`, `updated_at`) VALUES
(13, 10, 8, 11, 'CNT-01', 'berth_a', 'رصيف A', 'A-LOW-01', 19, 'alaaa', 'accepted', NULL, '2026-04-05 16:27:18', 12, 'شاحنة', 1, 'completed', '2026-04-05 16:27:42', 'alaaa', 'شاحنة', '2026-04-05 13:26:51', '2026-04-05 13:27:42'),
(14, 10, 8, 12, 'CNT-02', 'berth_c', 'رصيف C', 'C-LOW-01', 19, 'alaaa', 'accepted', NULL, '2026-04-05 16:28:44', 12, 'شاحنة', 2, 'completed', '2026-04-05 16:28:45', 'alaaa', 'شاحنة', '2026-04-05 13:26:51', '2026-04-05 13:28:45');

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_items`
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
-- إرجاع أو استيراد بيانات الجدول `inventory_items`
--

INSERT INTO `inventory_items` (`item_id`, `item_code`, `item_name`, `current_qty`, `unit`, `min_stock`, `location_id`, `images`) VALUES
(1, 'mat12', 'براغي', 8.00, 'قطعة', 52.00, NULL, NULL);

-- --------------------------------------------------------

--
-- بنية الجدول `locations`
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
-- إرجاع أو استيراد بيانات الجدول `locations`
--

INSERT INTO `locations` (`id`, `warehouse_id`, `code`, `rack`, `aisle`, `level`, `capacity`, `status`, `created_at`, `updated_at`) VALUES
(5, 4, 'LOC-01', NULL, NULL, NULL, NULL, 'حر', '2026-04-02 20:35:51', '2026-04-02 20:35:51');

-- --------------------------------------------------------

--
-- بنية الجدول `machines`
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
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `driver_user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `machines`
--

INSERT INTO `machines` (`machine_id`, `machine_code`, `machine_name`, `category`, `location_id`, `status`, `operating_hours`, `purchase_date`, `last_maintenance_date`, `next_maintenance_date`, `supplier_id`, `facility_name`, `notes`, `created_at`, `updated_at`, `driver_user_id`) VALUES
(12, 'MCH-01', 'شاحنة', 'شاحنة', 'المرفق-1', 'جاهزة', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, '2026-04-05 13:26:16', '2026-04-05 13:28:45', 19);

-- --------------------------------------------------------

--
-- بنية الجدول `maintenances`
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
-- بنية الجدول `purchases`
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
-- بنية الجدول `requests`
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
-- بنية الجدول `suppliers`
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
-- إرجاع أو استيراد بيانات الجدول `suppliers`
--

INSERT INTO `suppliers` (`supplier_id`, `name`, `email`, `primary_phone`, `rating`, `category`, `specialization`, `contact_person`, `secondary_phone`, `address`, `commercial_reg`, `tax_number`, `payment_terms`, `currency`, `status`, `transactions`, `total_value`) VALUES
(2, 'mohammed Ameen', 'omranadobe@gmail.com', '0988776655', 3, 'ثانوي', 'معدات الأمان', 'Hamed', '0988774433', 'none', '33333', '233345', 'صافي 90', 'USD', 'active', 0, 0.00);

-- --------------------------------------------------------

--
-- بنية الجدول `transaction_log`
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

-- --------------------------------------------------------

--
-- بنية الجدول `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(50) NOT NULL,
  `role` varchar(50) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `shift` varchar(100) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `availability_status` enum('متاح','مشغول') NOT NULL DEFAULT 'متاح'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- إرجاع أو استيراد بيانات الجدول `users`
--

INSERT INTO `users` (`user_id`, `email`, `password`, `role`, `full_name`, `shift`, `phone`, `availability_status`) VALUES
(1, 'admin1@gmail.com', '1234test', 'Admin', 'Mohamed Abo Aisha', NULL, NULL, 'متاح'),
(2, 'super1@gmail.com', '5678test', 'Supervisor', 'Yasser ', NULL, NULL, 'متاح'),
(7, 'Omar@gmail.com', '3456test', 'mechanic', 'Omar', NULL, NULL, 'متاح'),
(9, 'ahmaad@gmai.com', '2020', 'supervisor', 'dg', NULL, NULL, 'متاح'),
(14, 'mohamad2002269@gmail.com', '12345678', 'DockManager', 'محمد', NULL, NULL, 'متاح'),
(19, 'alaabahbouh@gmail.com', '2020', 'Driver', 'alaaa', NULL, NULL, 'متاح');

-- --------------------------------------------------------

--
-- بنية الجدول `warehouses`
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
-- إرجاع أو استيراد بيانات الجدول `warehouses`
--

INSERT INTO `warehouses` (`id`, `code`, `name`, `warehouse_type`, `location`, `status`, `created_at`, `updated_at`) VALUES
(4, 'WH-01', 'مستودع الزيوت', 'مستودع للزيوت والشحوم', 'طرطوس', 'نشط', '2026-04-02 20:19:51', '2026-04-02 20:33:52'),
(5, 'WH-02', 'مستودع ايطارات', 'مستودع للاطارات', 'طرطوس', 'نشط', '2026-04-02 20:23:47', '2026-04-02 20:33:42'),
(6, 'WH-03', 'مستودع ميكانيكي', 'مستودع للقطع الميكانيكية', 'جبلة', 'نشط', '2026-04-02 20:34:50', '2026-04-02 20:34:50'),
(9, 'WH-04', 'كهرباء', 'مستودع للقطع الكهربائية', 'النبك', 'نشط', '2026-04-02 20:50:29', '2026-04-02 20:50:29');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `dock_delivery_requests`
--
ALTER TABLE `dock_delivery_requests`
  ADD PRIMARY KEY (`request_id`),
  ADD KEY `idx_dock_requests_slot` (`slot_id`),
  ADD KEY `idx_dock_requests_driver` (`driver_user_id`);

--
-- Indexes for table `dock_slots`
--
ALTER TABLE `dock_slots`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_dock_slot_code` (`slot_code`);

--
-- Indexes for table `incoming_vessels`
--
ALTER TABLE `incoming_vessels`
  ADD PRIMARY KEY (`vessel_id`),
  ADD KEY `idx_incoming_vessels_status` (`status`),
  ADD KEY `idx_incoming_vessels_arrival` (`expected_arrival`);

--
-- Indexes for table `incoming_vessel_containers`
--
ALTER TABLE `incoming_vessel_containers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_vessel_container_number` (`vessel_id`,`container_number`),
  ADD KEY `idx_incoming_vessel_containers_vessel` (`vessel_id`);

--
-- Indexes for table `incoming_vessel_discharge_plans`
--
ALTER TABLE `incoming_vessel_discharge_plans`
  ADD PRIMARY KEY (`plan_id`),
  ADD KEY `idx_discharge_plans_vessel` (`vessel_id`),
  ADD KEY `idx_discharge_plans_status` (`status`);

--
-- Indexes for table `incoming_vessel_discharge_tasks`
--
ALTER TABLE `incoming_vessel_discharge_tasks`
  ADD PRIMARY KEY (`task_id`),
  ADD KEY `idx_discharge_tasks_plan` (`plan_id`),
  ADD KEY `idx_discharge_tasks_vessel` (`vessel_id`),
  ADD KEY `idx_discharge_tasks_container` (`container_id`),
  ADD KEY `idx_discharge_tasks_driver` (`driver_user_id`),
  ADD KEY `idx_discharge_tasks_machine` (`machine_id`);

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
  ADD UNIQUE KEY `uniq_driver_user_id` (`driver_user_id`),
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
-- AUTO_INCREMENT for table `dock_delivery_requests`
--
ALTER TABLE `dock_delivery_requests`
  MODIFY `request_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `dock_slots`
--
ALTER TABLE `dock_slots`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=344;

--
-- AUTO_INCREMENT for table `incoming_vessels`
--
ALTER TABLE `incoming_vessels`
  MODIFY `vessel_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `incoming_vessel_containers`
--
ALTER TABLE `incoming_vessel_containers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `incoming_vessel_discharge_plans`
--
ALTER TABLE `incoming_vessel_discharge_plans`
  MODIFY `plan_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `incoming_vessel_discharge_tasks`
--
ALTER TABLE `incoming_vessel_discharge_tasks`
  MODIFY `task_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `inventory_items`
--
ALTER TABLE `inventory_items`
  MODIFY `item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `machines`
--
ALTER TABLE `machines`
  MODIFY `machine_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

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
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `warehouses`
--
ALTER TABLE `warehouses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- قيود الجداول المُلقاة.
--

--
-- قيود الجداول `inventory_items`
--
ALTER TABLE `inventory_items`
  ADD CONSTRAINT `fk_item_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `locations`
--
ALTER TABLE `locations`
  ADD CONSTRAINT `locations_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `machines`
--
ALTER TABLE `machines`
  ADD CONSTRAINT `machines_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE SET NULL;

--
-- قيود الجداول `maintenances`
--
ALTER TABLE `maintenances`
  ADD CONSTRAINT `maintenances_ibfk_1` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`machine_id`) ON DELETE CASCADE;

--
-- قيود الجداول `purchases`
--
ALTER TABLE `purchases`
  ADD CONSTRAINT `fk_purchase_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE;

--
-- قيود الجداول `requests`
--
ALTER TABLE `requests`
  ADD CONSTRAINT `requests_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`);

--
-- قيود الجداول `transaction_log`
--
ALTER TABLE `transaction_log`
  ADD CONSTRAINT `transaction_log_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`item_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
