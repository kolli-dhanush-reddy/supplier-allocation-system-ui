"""
Seed / default data for local development.
Mirrors the static data already displayed in the Next.js frontend.
In a production system this would come from a database.
"""

from app.models.demand import DemandPeriod, SKUDemand
from app.models.pricing import PricingEntry
from app.models.purchase_order import POLineItem, POStatus, PurchaseOrder
from app.models.supplier import Supplier, SupplierStatus, TieredPrice

# ── Suppliers ─────────────────────────────────────────────────────────────────

SUPPLIERS: list[Supplier] = [
    Supplier(
        id="SUP-001",
        name="Apex Components",
        status=SupplierStatus.active,
        reliability_score=92,
        lead_time_days=7,
        weekly_capacity=5000,
        moq=100,
        location="Chicago, IL",
        logistics_cost_per_unit=0.80,
        tiered_pricing=[
            TieredPrice(min_qty=0,    price_per_unit=12.50),
            TieredPrice(min_qty=500,  price_per_unit=11.75),
            TieredPrice(min_qty=2000, price_per_unit=10.90),
        ],
    ),
    Supplier(
        id="SUP-002",
        name="Northstar Metals",
        status=SupplierStatus.active,
        reliability_score=88,
        lead_time_days=10,
        weekly_capacity=3500,
        moq=50,
        location="Detroit, MI",
        logistics_cost_per_unit=1.10,
        tiered_pricing=[
            TieredPrice(min_qty=0,    price_per_unit=9.80),
            TieredPrice(min_qty=300,  price_per_unit=9.20),
            TieredPrice(min_qty=1500, price_per_unit=8.60),
        ],
    ),
    Supplier(
        id="SUP-003",
        name="Vertex Plastics",
        status=SupplierStatus.at_risk,
        reliability_score=74,
        lead_time_days=14,
        weekly_capacity=4000,
        moq=200,
        location="Houston, TX",
        logistics_cost_per_unit=0.60,
        tiered_pricing=[
            TieredPrice(min_qty=0,    price_per_unit=6.40),
            TieredPrice(min_qty=1000, price_per_unit=5.95),
            TieredPrice(min_qty=3000, price_per_unit=5.50),
        ],
    ),
    Supplier(
        id="SUP-004",
        name="Meridian Supply",
        status=SupplierStatus.active,
        reliability_score=95,
        lead_time_days=5,
        weekly_capacity=2500,
        moq=0,
        location="Atlanta, GA",
        logistics_cost_per_unit=1.30,
        tiered_pricing=[
            TieredPrice(min_qty=0,   price_per_unit=14.00),
            TieredPrice(min_qty=500, price_per_unit=13.20),
        ],
    ),
    Supplier(
        id="SUP-005",
        name="Pinnacle Global",
        status=SupplierStatus.active,
        reliability_score=81,
        lead_time_days=18,
        weekly_capacity=6000,
        moq=300,
        location="Los Angeles, CA",
        logistics_cost_per_unit=0.50,
        tiered_pricing=[
            TieredPrice(min_qty=0,    price_per_unit=7.20),
            TieredPrice(min_qty=1000, price_per_unit=6.80),
            TieredPrice(min_qty=4000, price_per_unit=6.20),
        ],
    ),
]

# ── SKU Demand (6-week horizon) ───────────────────────────────────────────────

DEMANDS: list[SKUDemand] = [
    SKUDemand(
        sku_id="SKU-101",
        sku_name="Aluminium Bracket A",
        category="Metals",
        periods=[
            DemandPeriod(period="W1", quantity=400),
            DemandPeriod(period="W2", quantity=450),
            DemandPeriod(period="W3", quantity=500),
            DemandPeriod(period="W4", quantity=480),
            DemandPeriod(period="W5", quantity=520),
            DemandPeriod(period="W6", quantity=460),
        ],
        safety_stock=50,
    ),
    SKUDemand(
        sku_id="SKU-202",
        sku_name="Polymer Housing B",
        category="Plastics",
        periods=[
            DemandPeriod(period="W1", quantity=600),
            DemandPeriod(period="W2", quantity=580),
            DemandPeriod(period="W3", quantity=620),
            DemandPeriod(period="W4", quantity=700),
            DemandPeriod(period="W5", quantity=650),
            DemandPeriod(period="W6", quantity=690),
        ],
        safety_stock=80,
    ),
    SKUDemand(
        sku_id="SKU-303",
        sku_name="Steel Fastener C",
        category="Metals",
        periods=[
            DemandPeriod(period="W1", quantity=1200),
            DemandPeriod(period="W2", quantity=1100),
            DemandPeriod(period="W3", quantity=1350),
            DemandPeriod(period="W4", quantity=1400),
            DemandPeriod(period="W5", quantity=1300),
            DemandPeriod(period="W6", quantity=1250),
        ],
        safety_stock=150,
    ),
    SKUDemand(
        sku_id="SKU-441",
        sku_name="Circuit Module D",
        category="Electronics",
        periods=[
            DemandPeriod(period="W1", quantity=300),
            DemandPeriod(period="W2", quantity=320),
            DemandPeriod(period="W3", quantity=310),
            DemandPeriod(period="W4", quantity=340),
            DemandPeriod(period="W5", quantity=360),
            DemandPeriod(period="W6", quantity=330),
        ],
        safety_stock=30,
    ),
]

# ── Pricing (supplier × SKU) ──────────────────────────────────────────────────

PRICING: list[PricingEntry] = [
    # Apex Components
    PricingEntry(supplier_id="SUP-001", sku_id="SKU-101", base_price=12.50, logistics_cost=0.80),
    PricingEntry(supplier_id="SUP-001", sku_id="SKU-202", base_price=6.80,  logistics_cost=0.80),
    PricingEntry(supplier_id="SUP-001", sku_id="SKU-303", base_price=4.20,  logistics_cost=0.80),
    PricingEntry(supplier_id="SUP-001", sku_id="SKU-441", base_price=18.90, logistics_cost=0.80),
    # Northstar Metals
    PricingEntry(supplier_id="SUP-002", sku_id="SKU-101", base_price=11.80, logistics_cost=1.10),
    PricingEntry(supplier_id="SUP-002", sku_id="SKU-202", base_price=7.10,  logistics_cost=1.10),
    PricingEntry(supplier_id="SUP-002", sku_id="SKU-303", base_price=3.90,  logistics_cost=1.10),
    PricingEntry(supplier_id="SUP-002", sku_id="SKU-441", base_price=20.40, logistics_cost=1.10),
    # Vertex Plastics
    PricingEntry(supplier_id="SUP-003", sku_id="SKU-101", base_price=13.20, logistics_cost=0.60),
    PricingEntry(supplier_id="SUP-003", sku_id="SKU-202", base_price=5.95,  logistics_cost=0.60),
    PricingEntry(supplier_id="SUP-003", sku_id="SKU-303", base_price=4.50,  logistics_cost=0.60),
    PricingEntry(supplier_id="SUP-003", sku_id="SKU-441", base_price=17.80, logistics_cost=0.60),
    # Meridian Supply
    PricingEntry(supplier_id="SUP-004", sku_id="SKU-101", base_price=14.00, logistics_cost=1.30),
    PricingEntry(supplier_id="SUP-004", sku_id="SKU-202", base_price=7.80,  logistics_cost=1.30),
    PricingEntry(supplier_id="SUP-004", sku_id="SKU-303", base_price=5.10,  logistics_cost=1.30),
    PricingEntry(supplier_id="SUP-004", sku_id="SKU-441", base_price=19.50, logistics_cost=1.30),
    # Pinnacle Global
    PricingEntry(supplier_id="SUP-005", sku_id="SKU-101", base_price=10.90, logistics_cost=0.50),
    PricingEntry(supplier_id="SUP-005", sku_id="SKU-202", base_price=6.20,  logistics_cost=0.50),
    PricingEntry(supplier_id="SUP-005", sku_id="SKU-303", base_price=3.60,  logistics_cost=0.50),
    PricingEntry(supplier_id="SUP-005", sku_id="SKU-441", base_price=16.90, logistics_cost=0.50),
]

# ── Purchase Orders ───────────────────────────────────────────────────────────

PURCHASE_ORDERS: list[PurchaseOrder] = [
    PurchaseOrder(
        po_number="PO-10482",
        supplier_id="SUP-001",
        supplier_name="Apex Components",
        line_items=[
            POLineItem(sku_id="SKU-101", sku_name="Aluminium Bracket A", quantity=500,  unit_price=11.75, line_total=5875.00),
            POLineItem(sku_id="SKU-202", sku_name="Polymer Housing B",   quantity=800,  unit_price=6.80,  line_total=5440.00),
            POLineItem(sku_id="SKU-303", sku_name="Steel Fastener C",    quantity=2000, unit_price=4.20,  line_total=8400.00),
        ],
        order_value=184250.00,
        expected_delivery="2026-10-08",  # type: ignore[arg-type]
        status=POStatus.in_transit,
    ),
    PurchaseOrder(
        po_number="PO-10481",
        supplier_id="SUP-002",
        supplier_name="Northstar Metals",
        line_items=[
            POLineItem(sku_id="SKU-101", sku_name="Aluminium Bracket A", quantity=420,  unit_price=11.80, line_total=4956.00),
            POLineItem(sku_id="SKU-303", sku_name="Steel Fastener C",    quantity=1500, unit_price=3.90,  line_total=5850.00),
        ],
        order_value=96480.00,
        expected_delivery="2026-10-12",  # type: ignore[arg-type]
        status=POStatus.confirmed,
    ),
    PurchaseOrder(
        po_number="PO-10479",
        supplier_id="SUP-003",
        supplier_name="Vertex Plastics",
        line_items=[
            POLineItem(sku_id="SKU-202", sku_name="Polymer Housing B", quantity=1200, unit_price=5.95, line_total=7140.00),
            POLineItem(sku_id="SKU-441", sku_name="Circuit Module D",  quantity=300,  unit_price=17.80, line_total=5340.00),
        ],
        order_value=72920.00,
        expected_delivery="2026-10-15",  # type: ignore[arg-type]
        status=POStatus.at_risk,
    ),
    PurchaseOrder(
        po_number="PO-10476",
        supplier_id="SUP-004",
        supplier_name="Meridian Supply",
        line_items=[
            POLineItem(sku_id="SKU-441", sku_name="Circuit Module D", quantity=250, unit_price=19.50, line_total=4875.00),
        ],
        order_value=41300.00,
        expected_delivery="2026-10-18",  # type: ignore[arg-type]
        status=POStatus.draft,
    ),
]
