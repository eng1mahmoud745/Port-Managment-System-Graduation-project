# Maintenance Management System for Seaports

**Web Application for Seaport Equipment Maintenance in Syria**

This graduation project is submitted as a requirement for obtaining the Nile Certificate in Information Technology Engineering Sciences — Al-Qalamoun Private University, Faculty of Engineering, Department of Information Technology Engineering (2025/2026).

---

📋 Project Overview

Seaports are among the most important economic infrastructure and information sources in Syria, playing a fundamental role in import, export, and maritime trade operations. This **Profit Management System** integrates several core modules into one:

- 🔧 Cloud Computing Management System (CMMS) for equipment and machinery
- 📦 Warehouse and spare parts management
- 🚢 Vessel management (tracking, distribution, and unloading of cargo)
- ⚡ Dock management (berthing and departure planning, operational planning)
- 🚚 Driver management (task allocation, performance tracking)

The system focuses solely on internal port operations, without interfering with customs and tax procedures.

🎯 Problem and Objective

Syrian seaports currently manage maintenance operations manually or through traditional, disconnected systems. This exacerbates weaknesses in management and the temporary nature of personnel and drivers, leading to equipment damage and downtime.

The project aims to develop a unified system to connect these electronic modules, providing the port manager with a comprehensive overview. This system offers a viable alternative to traditional, non-electronic systems like SAP PM and IBM Maximo, making it suitable for adoption. 🧭 Project Scope

Within Scope:

- Maintenance, Warehouse, and Fixed Equipment Management
- Vessel Management (Track, Distribution, Unloading, Storage)
- Dock Management (Berth and Departure Planning)
- Driver and Vehicle Management

Outside Scope:

- Customs Clearance
- Integrated Financial and Accounting Operations (Payroll, General Accounting)
- General Human Resources Management
- Aircraft Systems for Shipping Lines

👥 Users and Their Roles in the System

| Role | Key Permissions |

|---|---|

| General Manager (Supervisor) | User Management, Dock and Procurement Requests, Estimation |

| Dock Manager | Berth Planning, Timer and Vessel Management, Central Control Panel |

| Vehicle Supervisor | Review and Approve Update Requests, Track Civil Status |

| Warehouse Supervisor | Inventory Management, Suppliers, Issue and Receive Requests |

| Driver | Create Maintenance Requests, Receive Requests, Timetable | 🛠️ Technologies Used

| Category | Technology |

|---|---|

| Front End | HTML, CSS, JavaScript |

| Server (Back End) | Node.js, Express.js |

| Database | MySQL |

| On-premises Development Environment | XAMPP (Apache, MySQL, PHP) |

| Analysis and Analysis Tools | StarUML (UML Schemas) |

| Development World | Visual Studio Code |

| New Interface Testing | Postman |

| Modification Management | Portal |


⚙️ Installation and Operation

``` Bash
# 1. Repository
Clone the gateway https://github.com/USERNAME/REPO-NAME.git
Disarmament Conference name of the repo

# 2. Install Dependencies
Install npm

# 3. Database Configuration
# Import the project's SQL file into MySQL via phpMyAdmin or the command line

# 4. Environment Variables Configuration
# Create a .env file on .env.example and specify the database connection details

# 5. Server Startup
Start npm

```

After starting, the system can be accessed via the browser in the project settings (e.g., `http://localhost:3000`).

👨‍💻 Team

- Mohammed Abu Aisha

- Mahmoud Zakhour

🎓 Academic Supervision

- Dr. M. Qusay Binshi

🔮 Future Prospects

- Mobile application for drivers to receive assignments and update their status
- Adding a GPS system for accurate tracking of appointments and drivers
- Coordination with Syrian Customs via APIs
- Multilingual support (Arabic and English)
- Migration to a large and permanent database with backup

📄 License

This project is for a specific period as a graduation project.