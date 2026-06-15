export const PRESET_EXAMPLES = [
    {
        name: "Standard Counter",
        yaml: `name: "Standard Item Counter"
profile: SIMPLE_COUNT
engine:
  type: counter
  config:
    step: 1
    allow_negative: false
initial_stock: 100`
    },
    {
        name: "Dimensional (Length)",
        yaml: `name: "Cable Spool (Meters)"
profile: UNIT_CONVERSION
engine:
  type: converter
  config:
    input_label: "Meters Used"
    stock_unit: "mm"
    ratio: 1000 # 1 Meter = 1000 mm
    step: 0.1
initial_stock: 50000`
    },
    {
        name: "Volume (Liquid)",
        yaml: `name: "Chemical Tank (Liters)"
profile: UNIT_CONVERSION
engine:
  type: converter
  config:
    input_label: "Milliliters"
    stock_unit: "ml"
    ratio: 1.0
    step: 50
initial_stock: 5000`
    },
    {
        name: "Time (Duration)",
        yaml: `name: "Machine Rental (Hours)"
profile: UNIT_CONVERSION
engine:
  type: converter
  config:
    input_label: "Hours Used"
    stock_unit: "min"
    ratio: 60 # 1 Hour = 60 Minutes
    step: 0.5
initial_stock: 6000 # 100 Hours`
    },
    {
        name: "Batch & Expiry",
        yaml: `name: "Perishable Goods"
profile: PERISHABLE
engine:
  type: bucket
  config:
    fields:
      - key: "lot_id"
        label: "Lot Number"
      - key: "expiry"
        label: "Expiration Date"
initial_stock: []`
    },
    {
        name: "Serial Numbers",
        yaml: `name: "Tracked Assets"
profile: SERIALIZED
engine:
  type: bucket
  config:
    fields:
      - key: "serial_no"
        label: "Serial Number"
      - key: "condition"
        label: "Condition"
initial_stock: []`
    },
    {
        name: "Simple Bucket (Batch)",
        yaml: `name: "Bulk Material Batch"
profile: BATCH_TRACKED
engine:
  type: bucket
  config:
    fields:
      - key: "batch_id"
        label: "Batch ID"
initial_stock: []`
    },
    {
        name: "Generic Converter",
        yaml: `name: "Widget Converter"
profile: UNIT_CONVERSION
engine:
  type: converter
  config:
    input_label: "Boxes"
    stock_unit: "widgets"
    ratio: 12 # 1 Box = 12 Widgets
    step: 1
initial_stock: 120`
    }
];
