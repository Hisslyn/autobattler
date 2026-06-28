# Item-Art Asset Inventory

Filesystem metadata only (names, paths, byte sizes). 65 image files total.

## Directory tree

```
items/
├── consumables/
│   ├── item_remover.png
│   ├── radiant_enhancer.png
│   └── reforger.png
├── layers/
│   ├── bg_glow.png
│   ├── bg_plain.png
│   ├── emblem_square.png
│   ├── frame_artifact.png
│   ├── frame_completed.png
│   ├── frame_component.png
│   ├── frame_mythical.png
│   └── frame_radiant.png
├── tier 1/
│   ├── chain_vest.png
│   ├── giants_belt.png
│   ├── iron_sword.png
│   ├── mana_crystal.png
│   ├── negatron_cloak.png
│   ├── recurve_bow.png
│   ├── sorcerer_rod.png
│   ├── sparring_gloves.png
│   └── tear_flask.png
├── tier 2/
│   ├── chain_vest__giants_belt.png
│   ├── chain_vest__mana_crystal.png
│   ├── chain_vest__negatron_cloak.png
│   ├── chain_vest__recurve_bow.png
│   ├── chain_vest__sorcerer_rod.png
│   ├── chain_vest__sparring_gloves.png
│   ├── chain_vest__tear_flask.png
│   ├── giants_belt__sorcerer_rod.png
│   ├── giants_belt__sparring_gloves.png
│   ├── giants_belt__tear_flask.png
│   ├── iron_sword__chain_vest.png
│   ├── iron_sword__giants_belt.png
│   ├── iron_sword__mana_crystal.png
│   ├── iron_sword__negatron_cloak.png
│   ├── iron_sword__recurve_bow.png
│   ├── iron_sword__sorcerer_rod.png
│   ├── iron_sword__sparring_gloves.png
│   ├── iron_sword__tear_flask.png
│   ├── mana_crystal__giants_belt.png
│   ├── mana_crystal__negatron_cloak.png
│   ├── mana_crystal__recurve_bow.png
│   ├── mana_crystal__sorcerer_rod.png
│   ├── mana_crystal__sparring_gloves.png
│   ├── mana_crystal__tear_flask.png
│   ├── negatron_cloak__giants_belt.png
│   ├── negatron_cloak__sorcerer_rod.png
│   ├── negatron_cloak__sparring_gloves.png
│   ├── negatron_cloak__tear_flask.png
│   ├── recurve_bow__giants_belt.png
│   ├── recurve_bow__negatron_cloak.png
│   ├── recurve_bow__sorcerer_rod.png
│   ├── recurve_bow__sparring_gloves.png
│   ├── recurve_bow__tear_flask.png
│   ├── sorcerer_rod__sparring_gloves.png
│   ├── sorcerer_rod__tear_flask.png
│   └── sparring_gloves__tear_flask.png
├── tier 3/
│   ├── stormrider.png
│   ├── titan_heart.png
│   ├── voidmantle.png
│   ├── voidstaff.png
│   ├── warblade.png
│   └── warplate.png
└── tier 5/
    ├── arcane_engine.png
    ├── eclipse_crown.png
    └── undying_bulwark.png
```

## Flat list by filename family

`path  —  bytes` (each file once, grouped by leading-string prefix).

### bg_*
```
layers/bg_glow.png  —  201520
layers/bg_plain.png  —  177054
```

### emblem_*
```
layers/emblem_square.png  —  27924
```

### frame_*
```
layers/frame_artifact.png  —  75073
layers/frame_completed.png  —  57940
layers/frame_component.png  —  55200
layers/frame_mythical.png  —  77110
layers/frame_radiant.png  —  67782
```

### consumables
```
consumables/item_remover.png  —  25461
consumables/radiant_enhancer.png  —  166494
consumables/reforger.png  —  17581
```

### chain_vest*
```
tier 1/chain_vest.png  —  58846
tier 2/chain_vest__giants_belt.png  —  33266
tier 2/chain_vest__mana_crystal.png  —  69514
tier 2/chain_vest__negatron_cloak.png  —  65548
tier 2/chain_vest__recurve_bow.png  —  60431
tier 2/chain_vest__sorcerer_rod.png  —  73087
tier 2/chain_vest__sparring_gloves.png  —  57189
tier 2/chain_vest__tear_flask.png  —  71780
```

### giants_belt*
```
tier 1/giants_belt.png  —  29561
tier 2/giants_belt__sorcerer_rod.png  —  94905
tier 2/giants_belt__sparring_gloves.png  —  89227
tier 2/giants_belt__tear_flask.png  —  86492
```

### iron_sword*
```
tier 1/iron_sword.png  —  22291
tier 2/iron_sword__chain_vest.png  —  19132
tier 2/iron_sword__giants_belt.png  —  22460
tier 2/iron_sword__mana_crystal.png  —  75708
tier 2/iron_sword__negatron_cloak.png  —  72610
tier 2/iron_sword__recurve_bow.png  —  77288
tier 2/iron_sword__sorcerer_rod.png  —  79272
tier 2/iron_sword__sparring_gloves.png  —  16739
tier 2/iron_sword__tear_flask.png  —  75834
```

### mana_crystal*
```
tier 1/mana_crystal.png  —  32368
tier 2/mana_crystal__giants_belt.png  —  56725
tier 2/mana_crystal__negatron_cloak.png  —  130323
tier 2/mana_crystal__recurve_bow.png  —  114615
tier 2/mana_crystal__sorcerer_rod.png  —  85328
tier 2/mana_crystal__sparring_gloves.png  —  109009
tier 2/mana_crystal__tear_flask.png  —  97947
```

### negatron_cloak*
```
tier 1/negatron_cloak.png  —  39391
tier 2/negatron_cloak__giants_belt.png  —  58724
tier 2/negatron_cloak__sorcerer_rod.png  —  63239
tier 2/negatron_cloak__sparring_gloves.png  —  57661
tier 2/negatron_cloak__tear_flask.png  —  61521
```

### recurve_bow*
```
tier 1/recurve_bow.png  —  17998
tier 2/recurve_bow__giants_belt.png  —  116823
tier 2/recurve_bow__negatron_cloak.png  —  121683
tier 2/recurve_bow__sorcerer_rod.png  —  101862
tier 2/recurve_bow__sparring_gloves.png  —  120264
tier 2/recurve_bow__tear_flask.png  —  111480
```

### sorcerer_rod*
```
tier 1/sorcerer_rod.png  —  21387
tier 2/sorcerer_rod__sparring_gloves.png  —  107916
tier 2/sorcerer_rod__tear_flask.png  —  107718
```

### sparring_gloves*
```
tier 1/sparring_gloves.png  —  40662
tier 2/sparring_gloves__tear_flask.png  —  93603
```

### tear_flask*
```
tier 1/tear_flask.png  —  52663
```

### tier 3 (artifacts)
```
tier 3/stormrider.png  —  88758
tier 3/titan_heart.png  —  122207
tier 3/voidmantle.png  —  28963
tier 3/voidstaff.png  —  81549
tier 3/warblade.png  —  20435
tier 3/warplate.png  —  33067
```

### tier 5 (mythicals)
```
tier 5/arcane_engine.png  —  93970
tier 5/eclipse_crown.png  —  75706
tier 5/undying_bulwark.png  —  68173
```

## Counts per subfolder

| Subfolder | Image files |
|-----------|-------------|
| consumables | 3 |
| layers | 8 |
| tier 1 | 9 |
| tier 2 | 36 |
| tier 3 | 6 |
| tier 5 | 3 |
| **Total** | **65** |
