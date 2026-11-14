"""
Builds and renders the desk scene used by terminal.html.

    python3 build_room.py --out <dir> [--scale 1.0] [--samples 256] [--only wide|close]

Everything is procedural: no external models or textures. The render is split
into four Cycles light groups so the page can relight the room in the browser:

    base    moonlight through the blinds + ambient
    lamp    the desk lamp
    accent  LED strip, neon sign, PC fans, keyboard glow (rendered white, tinted in JS)
    screen  light from the monitors (rendered white, tinted in JS)

Two views are rendered from the same camera position: the wide room shot and a
high resolution crop around the main monitor (for the "sit down" zoom).
"""
import argparse
import json
import math
import os
import random
import sys

import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--samples", type=int, default=256)
ap.add_argument("--only", default="")
ap.add_argument("--tex", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "tex"))
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

random.seed(7)
W, H = 2400, 1350
CLOSE_ZOOM = 3.0  # close-up covers 1/3 of the frame width

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
vl = bpy.context.view_layer
for g in ("base", "lamp", "accent", "screen"):
    vl.lightgroups.add(name=g)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.10, 0.16, 0.32, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.06
world.lightgroup = "base"

col = bpy.data.collections.new("Room")
scene.collection.children.link(col)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.08
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def emit_mat(name, color=(1, 1, 1), strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (*color, 1)
    e.inputs[1].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def image_emit_mat(name, path, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[1].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(t.outputs[0], e.inputs[0])
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def image_mat(name, path, rough=0.6):
    m = mat(name, (1, 1, 1), rough)
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path)
    nt.links.new(t.outputs[0], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def link(o, group=None, smooth=False):
    col.objects.link(o)
    if group:
        o.lightgroup = group
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def box(name, size, loc, material, bevel=0.0, rot=(0, 0, 0), group=None, segments=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(material)
    link(o, group, smooth=bevel > 0)
    if bevel > 0:
        m = o.modifiers.new("wn", "WEIGHTED_NORMAL")
        m.keep_sharp = True
    return o


def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=48, r2=None, group=None, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    if bevel > 0:
        edges = [e for e in bm.edges if all(abs(abs(v.co.z) - depth / 2) < 1e-6 for v in e.verts)
                 and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=3, affect="EDGES", profile=0.5)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(material)
    link(o, group, smooth=True)
    m = o.modifiers.new("wn", "WEIGHTED_NORMAL")
    m.keep_sharp = True
    for p in me.polygons:
        pass
    return o


def sphere(name, r, loc, material, scale=(1, 1, 1), group=None, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=r)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.scale = scale
    o.rotation_euler = rot
    me.materials.append(material)
    return link(o, group, smooth=True)


def torus(name, R, r, loc, material, rot=(0, 0, 0), group=None, arc=1.0, seg=64):
    """Torus built from a swept circle so partial arcs are possible."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = max(4, int(seg * arc))
    m = 14
    rings = []
    closed = arc >= 0.999
    count = n if closed else n + 1
    for i in range(count):
        a = 2 * math.pi * arc * i / n
        ring = []
        for j in range(m):
            b = 2 * math.pi * j / m
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(count - (0 if closed else 1)):
        a, b = rings[i], rings[(i + 1) % count]
        for j in range(m):
            bm.faces.new((a[j], b[j], b[(j + 1) % m], a[(j + 1) % m]))
    if not closed:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(material)
    return link(o, group, smooth=True)


def plane(name, sx, sy, loc, material, rot=(0, 0, 0), group=None):
    """Plane in local XY (normal +Z) with 0..1 UVs."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((-sx / 2, -sy / 2, 0), (sx / 2, -sy / 2, 0), (sx / 2, sy / 2, 0), (-sx / 2, sy / 2, 0))]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new()
    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = c
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(material)
    return link(o, group)


def parent(children, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    for c in children:
        c.parent = e
    e.location = loc
    e.rotation_euler = rot
    return e


R90 = math.pi / 2
FACE_CAM = (R90, 0, 0)  # plane normal -> -Y (towards the camera)

# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
def wood_mat(name, c1, c2, scale=1.0, rough=0.42):
    m = mat(name, c1, rough)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.2 * scale, 14 * scale, 14 * scale)
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 3.0
    n.inputs["Detail"].default_value = 8
    n.inputs["Roughness"].default_value = 0.62
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (*c2, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*c1, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    b = nt.nodes["Principled BSDF"]
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    nt.links.new(mp.outputs[0], n.inputs[0])
    nt.links.new(n.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], b.inputs["Base Color"])
    nt.links.new(n.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], b.inputs["Normal"])
    return m


def bumpy_mat(name, color, rough, scale, strength):
    m = mat(name, color, rough)
    nt = m.node_tree
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(n.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], nt.nodes["Principled BSDF"].inputs["Normal"])
    return m


M_WALL = bumpy_mat("wall", (0.15, 0.175, 0.225), 0.88, 260, 0.05)
M_FLOOR = wood_mat("floor", (0.10, 0.068, 0.045), (0.05, 0.033, 0.022), 0.5, 0.35)
M_DESK = wood_mat("desk", (0.34, 0.185, 0.085), (0.17, 0.085, 0.038), 1.0, 0.38)
M_SHELF = wood_mat("shelf", (0.30, 0.17, 0.08), (0.16, 0.08, 0.04), 1.4, 0.45)
M_BLACK = mat("black_metal", (0.012, 0.013, 0.015), 0.38, 1.0)
M_PLASTIC = mat("black_plastic", (0.016, 0.017, 0.02), 0.45)
M_PLASTIC_SOFT = mat("soft_plastic", (0.03, 0.032, 0.036), 0.7)
M_ALU = mat("aluminium", (0.55, 0.56, 0.58), 0.32, 1.0)
M_GLASS_BLACK = mat("black_glass", (0.004, 0.004, 0.005), 0.06, 0.0, coat=1.0)
M_MAT = bumpy_mat("deskmat", (0.018, 0.02, 0.025), 0.92, 900, 0.03)
M_KEY = mat("keycap", (0.03, 0.032, 0.038), 0.55)
M_KEY_ACC = mat("keycap_acc", (0.07, 0.55, 0.48), 0.5)
M_KEY_LIGHT = mat("keycap_light", (0.42, 0.44, 0.47), 0.55)
M_FABRIC = bumpy_mat("fabric", (0.022, 0.024, 0.03), 0.95, 1400, 0.25)
M_FABRIC_ACC = bumpy_mat("fabric_acc", (0.035, 0.22, 0.2), 0.9, 1400, 0.25)
M_CERAMIC = mat("ceramic", (0.82, 0.8, 0.76), 0.18, coat=0.6)
M_CERAMIC_DARK = mat("ceramic_dark", (0.03, 0.032, 0.036), 0.3, coat=0.4)
M_COFFEE = mat("coffee", (0.03, 0.014, 0.006), 0.12)
M_TERRA = mat("pot", (0.75, 0.74, 0.7), 0.55)
M_LEAF = mat("leaf", (0.035, 0.16, 0.05), 0.42, spec=0.4)
M_LEAF2 = mat("leaf2", (0.05, 0.22, 0.07), 0.42, spec=0.4)
M_SOIL = mat("soil", (0.02, 0.014, 0.01), 0.95)
M_DUCK = mat("duck", (0.9, 0.62, 0.03), 0.35, coat=0.3)
M_DUCK_BEAK = mat("duck_beak", (0.85, 0.2, 0.02), 0.4)
M_BLIND = mat("blind", (0.62, 0.63, 0.66), 0.5)
M_FRAME = mat("win_frame", (0.55, 0.56, 0.58), 0.5)
M_PAPER = mat("paper", (0.8, 0.78, 0.72), 0.7)
M_LAMP = mat("lamp_body", (0.02, 0.021, 0.024), 0.36, 0.9)
M_LAMP_IN = mat("lamp_inner", (0.85, 0.82, 0.75), 0.4)
M_RUG = bumpy_mat("rug", (0.05, 0.055, 0.07), 0.98, 500, 0.4)
E_ACCENT = emit_mat("e_accent", (1, 1, 1), 3.2)
E_ACCENT_SOFT = emit_mat("e_accent_soft", (1, 1, 1), 2.2)
E_NEON = emit_mat("e_neon", (1, 1, 1), 11.0)
E_SCREEN = emit_mat("e_screen", (1, 1, 1), 1.15)
E_BULB = emit_mat("e_bulb", (1.0, 0.62, 0.3), 26.0)
E_LED_GREEN = emit_mat("e_led", (1, 1, 1), 14.0)
E_SKY = emit_mat("e_sky", (0.12, 0.2, 0.42), 2.5)

# --------------------------------------------------------------------------
# room shell
# --------------------------------------------------------------------------
BACK_Y = 2.0
LEFT_X = -1.9
plane("floor", 9, 9, (0.5, -1.0, 0), M_FLOOR)
plane("ceiling", 9, 9, (0.5, -1.0, 2.75), M_WALL, rot=(math.pi, 0, 0))
plane("back_wall", 9, 2.75, (0.5, BACK_Y, 1.375), M_WALL, rot=FACE_CAM)
plane("right_wall", 9, 2.75, (3.6, -1.0, 1.375), M_WALL, rot=(R90, 0, -R90))
plane("front_wall", 9, 2.75, (0.5, -4.5, 1.375), M_WALL, rot=(R90, 0, math.pi))
box("skirting", (9, 0.015, 0.09), (0.5, BACK_Y - 0.008, 0.045), mat("skirt", (0.05, 0.055, 0.065), 0.5), bevel=0.003)

# left wall with a window opening (y: 0.25..1.55, z: 0.95..2.25)
WY0, WY1, WZ0, WZ1 = 0.45, 1.82, 0.92, 2.28
for name, (y0, y1, z0, z1) in {
    "lw_bottom": (-4.5, BACK_Y, 0, WZ0),
    "lw_top": (-4.5, BACK_Y, WZ1, 2.75),
    "lw_near": (-4.5, WY0, WZ0, WZ1),
    "lw_far": (WY1, BACK_Y, WZ0, WZ1),
}.items():
    box(name, (0.14, y1 - y0, z1 - z0), (LEFT_X - 0.07, (y0 + y1) / 2, (z0 + z1) / 2), M_WALL)
# frame, sill, mullion
wc_y, wc_z = (WY0 + WY1) / 2, (WZ0 + WZ1) / 2
box("win_sill", (0.2, WY1 - WY0 + 0.1, 0.035), (LEFT_X + 0.04, wc_y, WZ0 - 0.012), M_FRAME, bevel=0.006)
for i, y in enumerate((WY0 + 0.02, WY1 - 0.02, wc_y)):
    box(f"win_v{i}", (0.05, 0.04, WZ1 - WZ0), (LEFT_X - 0.09, y, wc_z), M_FRAME, bevel=0.004)
for i, z in enumerate((WZ0 + 0.02, WZ1 - 0.02)):
    box(f"win_h{i}", (0.05, WY1 - WY0, 0.04), (LEFT_X - 0.09, wc_y, z), M_FRAME, bevel=0.004)
# night sky card outside
sky = plane("sky", 6, 4, (LEFT_X - 1.2, wc_y, wc_z + 0.3), E_SKY, rot=(R90, 0, R90), group="base")
sky.visible_shadow = False
# venetian blinds
slat_n = 30
for i in range(slat_n):
    z = WZ0 + 0.05 + (WZ1 - WZ0 - 0.08) * i / (slat_n - 1)
    box(f"slat{i}", (0.034, WY1 - WY0 - 0.05, 0.0025), (LEFT_X - 0.025, wc_y, z), M_BLIND, rot=(0, math.radians(24), 0))
box("blind_head", (0.05, WY1 - WY0 - 0.03, 0.04), (LEFT_X - 0.025, wc_y, WZ1 - 0.02), M_FRAME, bevel=0.004)
for y in (WY0 + 0.25, WY1 - 0.25):
    cyl("blind_cord", 0.0012, WZ1 - WZ0, (LEFT_X - 0.025, y, wc_z), M_FRAME, verts=6)

# moonlight
sun = bpy.data.lights.new("moon", "SUN")
sun.energy = 8.5
sun.color = (0.50, 0.66, 1.0)
sun.angle = math.radians(1.1)
so = bpy.data.objects.new("moon", sun)
col.objects.link(so)
so.lightgroup = "base"
# light travels along local -Z; aim from the window towards the back wall / desk
d = Vector((1.0, 0.36, -0.33)).normalized()
so.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()

# soft fill so the foreground never goes fully black
fill = bpy.data.lights.new("fill", "AREA")
fill.energy = 28
fill.color = (0.35, 0.45, 0.8)
fill.size = 3
fo = bpy.data.objects.new("fill", fill)
fo.location = (0.2, -2.6, 2.4)
fo.rotation_euler = (math.radians(55), 0, 0)
col.objects.link(fo)
fo.lightgroup = "base"

# rug
box("rug", (2.6, 1.9, 0.012), (0.2, 0.6, 0.006), M_RUG, bevel=0.004)

# --------------------------------------------------------------------------
# desk
# --------------------------------------------------------------------------
DX, DY, DZ = 0.25, 1.52, 0.74  # desk centre x, centre y, top surface height
DW, DD = 1.9, 0.82
box("desk_top", (DW, DD, 0.036), (DX, DY, DZ - 0.018), M_DESK, bevel=0.006)
for sx in (-1, 1):
    x = DX + sx * (DW / 2 - 0.14)
    box(f"leg{sx}", (0.075, 0.05, DZ - 0.06), (x, DY, (DZ - 0.06) / 2 + 0.02), M_BLACK, bevel=0.004)
    box(f"foot{sx}", (0.08, 0.7, 0.03), (x, DY, 0.016), M_BLACK, bevel=0.006)
box("desk_beam", (DW - 0.3, 0.06, 0.04), (DX, DY + 0.05, DZ - 0.06), M_BLACK, bevel=0.004)
box("cable_tray", (1.1, 0.12, 0.08), (DX, DY + 0.3, DZ - 0.09), M_BLACK, bevel=0.004)
# drawer unit under the right side
box("drawers", (0.4, 0.55, 0.56), (DX + 0.52, DY + 0.05, 0.3), mat("drawer", (0.035, 0.037, 0.042), 0.5), bevel=0.006)
for i in range(3):
    box(f"drawer_gap{i}", (0.38, 0.004, 0.004), (DX + 0.52, DY - 0.226, 0.115 + i * 0.18), M_BLACK)
    box(f"drawer_pull{i}", (0.1, 0.012, 0.008), (DX + 0.52, DY - 0.232, 0.2 + i * 0.18), M_ALU, bevel=0.002)
# LED strip on the back edge of the desk, washing the wall
box("led_strip", (DW - 0.1, 0.008, 0.012), (DX, DY + DD / 2 + 0.005, DZ - 0.03), emit_mat("e_strip", (1, 1, 1), 7.0), group="accent")
# and a softer one under the desk's front lip
box("led_under", (DW - 0.5, 0.01, 0.006), (DX, DY + 0.1, DZ - 0.085), E_ACCENT_SOFT, group="accent")

# desk mat
box("deskmat", (0.95, 0.42, 0.004), (DX - 0.07, DY - 0.17, DZ + 0.002), M_MAT, bevel=0.0015)

# --------------------------------------------------------------------------
# main monitor (the terminal)
# --------------------------------------------------------------------------
MON_X, MON_Y, MON_Z = 0.18, DY + 0.16, DZ + 0.335
SW, SH = 0.62, 0.3875  # 16:10 panel
BEZ = 0.008
box("mon_body", (SW + 2 * BEZ, 0.022, SH + 2 * BEZ + 0.012), (MON_X, MON_Y + 0.012, MON_Z - 0.006), M_PLASTIC, bevel=0.004)
box("mon_back", (0.3, 0.03, 0.22), (MON_X, MON_Y + 0.035, MON_Z), M_PLASTIC_SOFT, bevel=0.012)
screen = plane("main_screen", SW, SH, (MON_X, MON_Y - 0.0002, MON_Z), E_SCREEN, rot=FACE_CAM, group="screen")
box("mon_neck", (0.05, 0.02, 0.26), (MON_X, MON_Y + 0.06, MON_Z - 0.16), M_ALU, bevel=0.004)
box("mon_foot", (0.26, 0.19, 0.012), (MON_X, MON_Y + 0.01, DZ + 0.006), M_ALU, bevel=0.004)
box("mon_led", (0.012, 0.002, 0.002), (MON_X + SW / 2 - 0.02, MON_Y - 0.0005, MON_Z - SH / 2 - 0.011), E_ACCENT_SOFT, group="accent")

# --------------------------------------------------------------------------
# vertical side monitor
# --------------------------------------------------------------------------
V_W, V_H = 0.30, 0.50
side = [
    box("side_body", (V_W + 0.016, 0.02, V_H + 0.016), (0, 0.011, 0), M_PLASTIC, bevel=0.004),
    plane("side_screen", V_W, V_H, (0, -0.0002, 0), image_emit_mat("side_img", os.path.join(args.tex, "side_screen.png"), 1.0),
          rot=FACE_CAM, group="screen"),
    box("side_neck", (0.04, 0.02, 0.34), (0, 0.045, -0.17), M_ALU, bevel=0.004),
    cyl("side_foot", 0.11, 0.012, (0, 0.03, -0.34), M_ALU, bevel=0.003),
]
parent(side, "side_monitor", (MON_X + 0.535, MON_Y - 0.075, DZ + 0.346), (0, 0, math.radians(-27)))

# --------------------------------------------------------------------------
# keyboard
# --------------------------------------------------------------------------
KB_X, KB_Y = MON_X - 0.02, DY - 0.2
kb = [box("kb_base", (0.325, 0.115, 0.018), (0, 0, 0.011), M_ALU, bevel=0.004),
      box("kb_glow", (0.31, 0.1, 0.002), (0, 0, 0.0205), E_ACCENT_SOFT, group="accent")]
rows = [14, 14, 13, 13, 9]
u = 0.0215
for r, n in enumerate(rows):
    y = 0.043 - r * u
    x = -0.151
    widths = [1.0] * n
    if r == 0:
        widths[-1] = 2.0; widths = widths[:13] + [2.0]
    if r == 1:
        widths[0] = 1.5; widths[-1] = 1.5
    if r == 2:
        widths[0] = 1.75; widths[-1] = 2.25
    if r == 3:
        widths[0] = 2.25; widths[-1] = 2.75; widths = [2.25] + [1.0] * 10 + [1.75, 1.0]
    if r == 4:
        widths = [1.25, 1.25, 1.25, 6.25, 1.0, 1.0, 1.0, 1.0, 1.0]
    for k, wdt in enumerate(widths):
        kw = wdt * u
        m = M_KEY
        if (r == 0 and k == 0) or (r == 2 and k == len(widths) - 1):
            m = M_KEY_ACC
        elif r == 4 and k == 3:
            m = M_KEY_LIGHT
        elif k == 0 or k == len(widths) - 1 or r == 4:
            m = M_PLASTIC_SOFT
        kb.append(box(f"key{r}_{k}", (kw - 0.003, u - 0.003, 0.009), (x + kw / 2, y, 0.026), m, bevel=0.0018, segments=2))
        x += kw
parent(kb, "keyboard", (KB_X, KB_Y, DZ + 0.004), (math.radians(4), 0, math.radians(1.5)))

# mouse
sphere("mouse", 0.034, (KB_X + 0.3, KB_Y + 0.0, DZ + 0.012), M_PLASTIC_SOFT, scale=(0.9, 1.6, 0.52), rot=(0, 0, math.radians(-6)))
box("mouse_glow", (0.004, 0.03, 0.002), (KB_X + 0.3, KB_Y - 0.01, DZ + 0.0305), E_ACCENT_SOFT, group="accent", rot=(math.radians(-9), 0, math.radians(-6)))

# --------------------------------------------------------------------------
# mug
# --------------------------------------------------------------------------
MUG = (MON_X - 0.47, DY - 0.2, DZ)
cyl("mug", 0.04, 0.092, (MUG[0], MUG[1], MUG[2] + 0.046), M_CERAMIC_DARK, bevel=0.004)
cyl("mug_coffee", 0.035, 0.002, (MUG[0], MUG[1], MUG[2] + 0.085), M_COFFEE)
cyl("mug_rim", 0.036, 0.008, (MUG[0], MUG[1], MUG[2] + 0.089), M_CERAMIC_DARK)
torus("mug_handle", 0.026, 0.006, (MUG[0] - 0.042, MUG[1] - 0.008, MUG[2] + 0.046), M_CERAMIC_DARK, rot=(R90, 0, math.radians(15)))

# notebook + pen
box("notebook", (0.15, 0.21, 0.012), (MON_X - 0.62, DY - 0.2, DZ + 0.006), mat("notebook", (0.03, 0.2, 0.18), 0.6), bevel=0.002, rot=(0, 0, math.radians(12)))
box("notebook_pages", (0.146, 0.206, 0.008), (MON_X - 0.62, DY - 0.2, DZ + 0.0065), M_PAPER, rot=(0, 0, math.radians(12)))
cyl("pen", 0.004, 0.14, (MON_X - 0.6, DY - 0.2, DZ + 0.017), M_ALU, rot=(R90, 0, math.radians(40)), verts=12)

# --------------------------------------------------------------------------
# desk lamp (left side of the desk)
# --------------------------------------------------------------------------
LX, LY = DX - DW / 2 + 0.2, DY + 0.2
cyl("lamp_base", 0.085, 0.018, (LX, LY, DZ + 0.009), M_LAMP, bevel=0.004)
a1 = math.radians(18)   # lower arm tilt
arm1 = 0.36
p1 = Vector((LX, LY, DZ + 0.018))
p2 = p1 + Vector((-math.sin(a1) * arm1, 0, math.cos(a1) * arm1))
cyl("lamp_arm1", 0.007, arm1, (p1 + p2) / 2, M_LAMP, rot=(0, -a1, 0), verts=16)
a2 = math.radians(62)
arm2 = 0.36
p3 = p2 + Vector((math.sin(a2) * arm2, 0, math.cos(a2) * arm2))
cyl("lamp_arm2", 0.007, arm2, (p2 + p3) / 2, M_LAMP, rot=(0, a2, 0), verts=16)
sphere("lamp_joint1", 0.014, p2, M_LAMP)
sphere("lamp_joint2", 0.014, p3, M_LAMP)
# head: a cone shade pointing down and a bit to the right
head_tilt = math.radians(22)
hd = Vector((math.sin(head_tilt), -0.12, -math.cos(head_tilt))).normalized()
hc = p3 + hd * 0.07
hrot = hd.to_track_quat("-Z", "Y").to_euler()
shade = cyl("lamp_shade", 0.085, 0.12, hc, M_LAMP, rot=hrot, r2=0.03, verts=48)
# open the bottom of the shade and give it thickness
bm = bmesh.new(); bm.from_mesh(shade.data)
bot = [f for f in bm.faces if len(f.verts) > 4 and f.calc_center_median().z < 0]
bmesh.ops.delete(bm, geom=bot, context="FACES")
bm.to_mesh(shade.data); bm.free()
sm = shade.modifiers.new("solid", "SOLIDIFY"); sm.thickness = 0.003; sm.offset = 1
shade.data.materials.append(M_LAMP_IN); sm.material_offset = 1
bulb = sphere("lamp_bulb", 0.026, hc + hd * 0.005, E_BULB, group="lamp")
lamp_light = bpy.data.lights.new("lamp_spot", "SPOT")
lamp_light.energy = 260
lamp_light.color = (1.0, 0.68, 0.38)
lamp_light.spot_size = math.radians(118)
lamp_light.spot_blend = 0.55
lamp_light.shadow_soft_size = 0.035
lo = bpy.data.objects.new("lamp_spot", lamp_light)
lo.location = hc + hd * 0.045
lo.rotation_euler = hrot
col.objects.link(lo)
lo.lightgroup = "lamp"
# faint omni so the shade itself / wall behind picks up some warmth
lamp_pt = bpy.data.lights.new("lamp_pt", "POINT")
lamp_pt.energy = 14
lamp_pt.color = (1.0, 0.66, 0.36)
lamp_pt.shadow_soft_size = 0.05
lp = bpy.data.objects.new("lamp_pt", lamp_pt)
lp.location = hc + hd * 0.1
col.objects.link(lp)
lp.lightgroup = "lamp"

# --------------------------------------------------------------------------
# PC tower (right end of the desk)
# --------------------------------------------------------------------------
PX, PY = DX + DW / 2 - 0.2, DY + 0.08
PW, PD, PH = 0.22, 0.44, 0.46
pc = [box("pc_case", (PW, PD, PH), (0, 0, PH / 2 + 0.012), M_PLASTIC, bevel=0.006)]
pc.append(box("pc_front", (PW - 0.03, 0.004, PH - 0.05), (0, -PD / 2 - 0.001, PH / 2 + 0.012), M_GLASS_BLACK, bevel=0.0015))
for i in range(3):
    z = 0.012 + 0.095 + i * 0.135
    pc.append(torus(f"pc_fan{i}", 0.052, 0.0032, (0, -PD / 2 - 0.004, z), E_ACCENT, rot=FACE_CAM, group="accent"))
    pc.append(cyl(f"pc_hub{i}", 0.018, 0.004, (0, -PD / 2 - 0.004, z), M_PLASTIC_SOFT, rot=FACE_CAM))
    for b in range(7):
        ang = b * 2 * math.pi / 7 + i
        pc.append(box(f"pc_blade{i}_{b}", (0.03, 0.002, 0.014),
                      (math.cos(ang) * 0.032, -PD / 2 - 0.003, z + math.sin(ang) * 0.032), M_PLASTIC_SOFT,
                      rot=(0, -ang + 0.5, 0)))
pc.append(box("pc_strip", (0.004, 0.003, PH - 0.08), (-PW / 2 + 0.012, -PD / 2 - 0.003, PH / 2 + 0.012), E_ACCENT, group="accent"))
pc.append(cyl("pc_power", 0.007, 0.003, (PW / 2 - 0.03, -PD / 2 + 0.03, PH + 0.013), E_ACCENT_SOFT, group="accent"))
for sx in (-1, 1):
    for sy in (-1, 1):
        pc.append(cyl(f"pc_ft{sx}{sy}", 0.015, 0.012, (sx * 0.08, sy * 0.17, 0.006), M_PLASTIC_SOFT))
parent(pc, "pc", (PX, PY, DZ), (0, 0, math.radians(9)))

# headphones on a stand, between monitor and PC? -> left of monitor, behind mug
HX, HY = MON_X - 0.47, DY + 0.19
cyl("hp_base", 0.06, 0.012, (HX, HY, DZ + 0.006), M_ALU, bevel=0.003)
cyl("hp_pole", 0.008, 0.25, (HX, HY, DZ + 0.13), M_ALU, verts=16)
box("hp_rest", (0.07, 0.035, 0.012), (HX, HY, DZ + 0.257), M_ALU, bevel=0.005)
torus("hp_band", 0.085, 0.009, (HX, HY, DZ + 0.185), M_PLASTIC_SOFT, rot=(R90, 0, 0), arc=0.5)
for sx in (-1, 1):
    cyl(f"hp_cup{sx}", 0.043, 0.035, (HX + sx * 0.082, HY, DZ + 0.165), M_PLASTIC, rot=(0, R90, 0), bevel=0.008)
    cyl(f"hp_pad{sx}", 0.04, 0.016, (HX + sx * 0.06, HY, DZ + 0.165), M_FABRIC, rot=(0, R90, 0), bevel=0.006)
    cyl(f"hp_ring{sx}", 0.03, 0.003, (HX + sx * 0.1, HY, DZ + 0.165), E_ACCENT_SOFT, rot=(0, R90, 0), group="accent")

# --------------------------------------------------------------------------
# wall: neon sign, posters, shelves
# --------------------------------------------------------------------------
fc = bpy.data.curves.new("neon", "FONT")
fc.body = "~$ hack the planet"
mono = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
if os.path.exists(mono):
    fc.font = bpy.data.fonts.load(mono)
fc.size = 0.125
fc.align_x = "CENTER"
fc.extrude = 0.0
fc.bevel_depth = 0.0055
fc.bevel_resolution = 4
fc.fill_mode = "NONE"
neon = bpy.data.objects.new("neon", fc)
neon.location = (MON_X - 0.22, BACK_Y - 0.03, 1.74)
neon.rotation_euler = FACE_CAM
neon.data.materials.append(E_NEON)
col.objects.link(neon)
neon.lightgroup = "accent"
box("neon_back", (1.42, 0.006, 0.24), (MON_X - 0.22, BACK_Y - 0.008, 1.775), mat("acrylic", (0.02, 0.022, 0.026), 0.12, coat=0.5), bevel=0.002)

# posters (left part of the back wall, catching the blinds' stripes)
def poster(name, img, w, h, x, z):
    box(name + "_frame", (w + 0.03, 0.018, h + 0.03), (x, BACK_Y - 0.01, z), M_BLACK, bevel=0.003)
    plane(name, w, h, (x, BACK_Y - 0.0195, z), image_mat(name, os.path.join(args.tex, img), 0.35), rot=FACE_CAM)

poster("poster_a", "poster_a.png", 0.42, 0.594, -1.4, 1.6)
poster("poster_b", "poster_b.png", 0.3, 0.3, -0.94, 1.745)
poster("poster_c", "poster_c.png", 0.3, 0.21, -0.94, 1.42)

# floating shelves on the right
def shelf(x, z, w):
    box("shelf", (w, 0.22, 0.03), (x, BACK_Y - 0.11, z), M_SHELF, bevel=0.004)
    box("shelf_led", (w - 0.06, 0.006, 0.004), (x, BACK_Y - 0.03, z - 0.017), E_ACCENT_SOFT, group="accent")
    return z + 0.015

BOOK_COLORS = [(0.03, 0.2, 0.18), (0.02, 0.03, 0.05), (0.5, 0.48, 0.44), (0.25, 0.04, 0.04), (0.06, 0.08, 0.22),
               (0.6, 0.35, 0.05), (0.04, 0.04, 0.045), (0.1, 0.12, 0.16), (0.3, 0.3, 0.32)]

def books(x, z, n, lean_last=True):
    for i in range(n):
        t = random.uniform(0.022, 0.045)
        h = random.uniform(0.19, 0.26)
        dpt = random.uniform(0.14, 0.17)
        c = random.choice(BOOK_COLORS)
        m = mat("book", c, random.uniform(0.4, 0.7))
        lean = math.radians(-11) if (lean_last and i == n - 1) else 0.0
        bx = x + t / 2 + (0.02 if lean else 0)
        b = box("book", (t, dpt, h), (bx, BACK_Y - 0.03 - dpt / 2, z + h / 2 + (0.002 if lean else 0)), m, bevel=0.002, rot=(0, lean, 0))
        box("book_band", (t + 0.0006, dpt + 0.0006, 0.012), (bx - math.sin(lean) * h * 0.25, BACK_Y - 0.03 - dpt / 2, z + h * 0.78), M_PAPER, rot=(0, lean, 0))
        x += t + 0.0015
    return x

SHX = 1.52
z1 = shelf(SHX, 1.42, 1.25)
z2 = shelf(SHX, 1.83, 1.25)
xb = books(SHX - 0.58, z1, 7)
# router with antennas + LEDs
RX = SHX + 0.3
box("router", (0.22, 0.13, 0.035), (RX, BACK_Y - 0.11, z1 + 0.0175), M_PLASTIC, bevel=0.006)
for i, sx in enumerate((-0.09, 0.0, 0.09)):
    cyl(f"ant{i}", 0.005, 0.16, (RX + sx, BACK_Y - 0.055, z1 + 0.11), M_PLASTIC, verts=12, rot=(0, math.radians(sx * 110), 0))
for i in range(5):
    box(f"rled{i}", (0.006, 0.002, 0.003), (RX - 0.07 + i * 0.022, BACK_Y - 0.176, z1 + 0.02), E_LED_GREEN, group="accent")
# small stacked books lying flat + duck
box("flat_book1", (0.23, 0.16, 0.03), (SHX + 0.02, BACK_Y - 0.11, z1 + 0.015), mat("fb1", (0.05, 0.06, 0.1), 0.6), bevel=0.002, rot=(0, 0, 0.1))
box("flat_book2", (0.2, 0.15, 0.025), (SHX + 0.02, BACK_Y - 0.11, z1 + 0.0435), mat("fb2", (0.5, 0.48, 0.44), 0.6), bevel=0.002, rot=(0, 0, -0.08))
DKX, DKZ = SHX + 0.02, z1 + 0.056
sphere("duck_body", 0.035, (DKX, BACK_Y - 0.11, DKZ + 0.026), M_DUCK, scale=(1.25, 1.0, 0.8))
sphere("duck_head", 0.023, (DKX - 0.028, BACK_Y - 0.11, DKZ + 0.062), M_DUCK)
sphere("duck_beak", 0.01, (DKX - 0.052, BACK_Y - 0.11, DKZ + 0.058), M_DUCK_BEAK, scale=(1.3, 1.0, 0.5))
sphere("duck_tail", 0.012, (DKX + 0.04, BACK_Y - 0.11, DKZ + 0.04), M_DUCK, scale=(1.2, 0.8, 0.8))
sphere("duck_eye", 0.0035, (DKX - 0.04, BACK_Y - 0.129, DKZ + 0.069), M_PLASTIC)

# upper shelf: plant, books, small speaker
def snake_plant(x, y, z, n=9, hmin=0.18, hmax=0.34):
    cyl("pot", 0.065, 0.11, (x, y, z + 0.055), M_TERRA, r2=0.075, bevel=0.004)
    cyl("soil", 0.068, 0.004, (x, y, z + 0.106), M_SOIL)
    for i in range(n):
        h = random.uniform(hmin, hmax)
        ang = random.uniform(0, 2 * math.pi)
        tilt = random.uniform(0.05, 0.3)
        r = random.uniform(0.0, 0.03)
        me = bpy.data.meshes.new("leafm")
        bm = bmesh.new()
        segs = 8
        prof = [0.55, 0.8, 0.95, 1.0, 0.95, 0.82, 0.6, 0.32, 0.0]
        wd = random.uniform(0.02, 0.03)
        rows_ = []
        for s in range(segs + 1):
            t = s / segs
            w_ = wd * prof[s]
            zc = h * t
            bend = 0.03 * t * t
            if w_ < 1e-5:
                rows_.append([bm.verts.new((0, bend, zc))])
            else:
                rows_.append([bm.verts.new((-w_, bend + 0.006, zc)), bm.verts.new((0, bend, zc)), bm.verts.new((w_, bend + 0.006, zc))])
        for s in range(segs):
            a_, b_ = rows_[s], rows_[s + 1]
            if len(b_) == 3:
                bm.faces.new((a_[0], a_[1], b_[1], b_[0])); bm.faces.new((a_[1], a_[2], b_[2], b_[1]))
            else:
                bm.faces.new((a_[0], a_[1], b_[0])); bm.faces.new((a_[1], a_[2], b_[0]))
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new("leaf", me)
        o.location = (x + math.cos(ang) * r, y + math.sin(ang) * r, z + 0.1)
        o.rotation_euler = Euler((tilt, 0, ang + R90), "XYZ")
        me.materials.append(random.choice((M_LEAF, M_LEAF2)))
        link(o, smooth=True)
        s_ = o.modifiers.new("s", "SOLIDIFY"); s_.thickness = 0.002

snake_plant(SHX - 0.42, BACK_Y - 0.11, z2)
books(SHX - 0.18, z2, 5)
SPX = SHX + 0.4
box("speaker", (0.13, 0.14, 0.2), (SPX, BACK_Y - 0.11, z2 + 0.1), M_PLASTIC_SOFT, bevel=0.012)
cyl("spk_cone", 0.045, 0.006, (SPX, BACK_Y - 0.182, z2 + 0.075), M_PLASTIC, rot=FACE_CAM)
cyl("spk_tw", 0.018, 0.006, (SPX, BACK_Y - 0.182, z2 + 0.155), M_PLASTIC, rot=FACE_CAM)
torus("spk_ring", 0.047, 0.0025, (SPX, BACK_Y - 0.183, z2 + 0.075), E_ACCENT_SOFT, rot=FACE_CAM, group="accent")

# a second plant on the window sill and one on the floor by the wall
snake_plant(LEFT_X + 0.07, WY1 - 0.3, WZ0 + 0.005, n=7, hmin=0.14, hmax=0.26)

# --------------------------------------------------------------------------
# chair (foreground)
# --------------------------------------------------------------------------
ch = []
ch.append(box("seat", (0.5, 0.5, 0.09), (0, 0, 0.5), M_FABRIC, bevel=0.035, segments=5))
ch.append(box("backrest", (0.47, 0.085, 0.6), (0, -0.25, 0.9), M_FABRIC, bevel=0.04, segments=5, rot=(math.radians(-8), 0, 0)))
ch.append(box("back_stripe", (0.06, 0.09, 0.56), (0, -0.2505, 0.9), M_FABRIC_ACC, bevel=0.02, rot=(math.radians(-8), 0, 0)))
ch.append(box("headrest", (0.3, 0.075, 0.15), (0, -0.31, 1.3), M_FABRIC, bevel=0.035, segments=5, rot=(math.radians(-8), 0, 0)))
ch.append(box("head_post", (0.05, 0.02, 0.14), (0, -0.3, 1.2), M_BLACK, bevel=0.004, rot=(math.radians(-8), 0, 0)))
for sx in (-1, 1):
    ch.append(box(f"arm{sx}", (0.07, 0.26, 0.03), (sx * 0.3, 0.0, 0.7), M_PLASTIC_SOFT, bevel=0.012))
    ch.append(box(f"arm_post{sx}", (0.03, 0.04, 0.2), (sx * 0.3, -0.02, 0.59), M_BLACK, bevel=0.004))
ch.append(cyl("gas", 0.028, 0.34, (0, 0, 0.28), M_BLACK))
for i in range(5):
    a = i * 2 * math.pi / 5 + 0.3
    ch.append(box(f"spoke{i}", (0.3, 0.04, 0.03), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.1), M_BLACK, bevel=0.006, rot=(0, 0, a)))
    ch.append(cyl(f"wheel{i}", 0.03, 0.045, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.03), M_PLASTIC, rot=(R90, 0, a)))
parent(ch, "chair", (-0.78, 0.5, 0.0), (0, 0, math.radians(-28)))

# backpack-ish box and bin on the floor, mostly for silhouette
cyl("bin", 0.14, 0.32, (DX - DW / 2 - 0.3, BACK_Y - 0.25, 0.16), M_BLACK, r2=0.16)

# --------------------------------------------------------------------------
# camera: straight on to the monitor, composed with lens shift so verticals
# stay vertical and the screen stays a clean rectangle.
# --------------------------------------------------------------------------
LENS, SHX_, SHY_ = 37, -0.085, 0.03
cam = bpy.data.cameras.new("cam")
cam.lens = LENS
cam.sensor_width = 36
cam.shift_x = SHX_
cam.shift_y = SHY_
co = bpy.data.objects.new("cam", cam)
co.location = (MON_X + 0.02, -2.0, 1.2)
co.rotation_euler = (R90, 0, 0)
col.objects.link(co)
scene.camera = co

scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.resolution_percentage = 100
bpy.context.view_layer.update()


def uv_of(p):
    v = world_to_camera_view(scene, co, Vector(p))
    return [round(v.x, 5), round(1 - v.y, 5)]  # top-left origin


def bbox_uv(objs, pad=0.0):
    xs, ys = [], []
    for o in objs:
        targets = [o] + list(o.children_recursive)
        for t in targets:
            if t.type not in ("MESH", "FONT"):
                continue
            for c in t.bound_box:
                u_, v_ = uv_of(t.matrix_world @ Vector(c))
                xs.append(u_); ys.append(v_)
    return [round(min(xs) - pad, 4), round(min(ys) - pad, 4), round(max(xs) + pad, 4), round(max(ys) + pad, 4)]


O = bpy.data.objects
scr = [uv_of(screen.matrix_world @ Vector(c)) for c in ((-SW / 2, SH / 2, 0), (SW / 2, SH / 2, 0), (SW / 2, -SH / 2, 0), (-SW / 2, -SH / 2, 0))]
cx = (scr[0][0] + scr[1][0]) / 2
cy = (scr[0][1] + scr[3][1]) / 2 + 0.03
cw = 1.0 / CLOSE_ZOOM
crop = [cx - cw / 2, cy - cw / 2, cx + cw / 2, cy + cw / 2]  # uv rect (square in uv = same aspect as frame)
meta = {
    "size": [W, H],
    "screen": scr,  # tl, tr, br, bl
    "close": [round(c, 5) for c in crop],
    "hotspots": {
        "monitor": bbox_uv([O["mon_body"]], 0.004),
        "lamp": bbox_uv([O["lamp_shade"], O["lamp_arm1"], O["lamp_arm2"], O["lamp_base"]], 0.006),
        "pc": bbox_uv([O["pc"]], 0.002),
        "neon": bbox_uv([O["neon_back"]], 0.0),
        "duck": bbox_uv([O["duck_body"], O["duck_head"]], 0.008),
        "side": bbox_uv([O["side_monitor"]], 0.0),
        "window": bbox_uv([O["blind_head"], O["win_sill"]], 0.0),
        "mug": bbox_uv([O["mug"]], 0.006),
    },
}
with open(os.path.join(args.out, "room.json"), "w") as f:
    json.dump(meta, f, indent=1)
print("META", json.dumps(meta))

# --------------------------------------------------------------------------
# render settings
# --------------------------------------------------------------------------
cy_ = scene.cycles
cy_.device = "CPU"
cy_.samples = args.samples
cy_.use_adaptive_sampling = True
cy_.adaptive_threshold = 0.012
cy_.use_denoising = False
cy_.max_bounces = 7
cy_.diffuse_bounces = 4
cy_.glossy_bounces = 4
cy_.transmission_bounces = 2
cy_.sample_clamp_indirect = 6.0
cy_.caustics_reflective = False
cy_.caustics_refractive = False
scene.render.threads_mode = "AUTO"
scene.render.film_transparent = False
scene.view_settings.view_transform = "Raw"
scene.display_settings.display_device = "sRGB"
vl.cycles.denoising_store_passes = True
vl.use_pass_combined = True

# compositor: denoise each light group, write one linear EXR per group
ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
scene.compositing_node_group = ng
rl = ng.nodes.new("CompositorNodeRLayers")
fo_ = ng.nodes.new("CompositorNodeOutputFile")
fo_.format.media_type = "IMAGE" if hasattr(fo_.format, "media_type") else fo_.format.media_type
fo_.format.file_format = "OPEN_EXR"
fo_.format.color_depth = "16"
fo_.format.exr_codec = "ZIP"
fo_.file_output_items.clear()
for g in ("base", "lamp", "accent", "screen"):
    dn = ng.nodes.new("CompositorNodeDenoise")
    ng.links.new(rl.outputs[f"Combined_{g}"], dn.inputs["Image"])
    ng.links.new(rl.outputs["Denoising Albedo"], dn.inputs["Albedo"])
    ng.links.new(rl.outputs["Denoising Normal"], dn.inputs["Normal"])
    item = fo_.file_output_items.new("RGBA", g)
    ng.links.new(dn.outputs["Image"], fo_.inputs[g])


def render(tag, zoom=1.0, center=(0.5, 0.5)):
    """Zoomed views keep the camera position and just narrow + shift the frustum."""
    cam.lens = LENS * zoom
    # shift is in units of sensor width at the *current* focal length
    cam.shift_x = (SHX_ + (center[0] - 0.5)) * zoom
    cam.shift_y = (SHY_ - (center[1] - 0.5) * H / W) * zoom
    scene.render.resolution_x = int(W * args.scale)
    scene.render.resolution_y = int(H * args.scale)
    fo_.directory = os.path.join(args.out, tag)
    fo_.file_name = "pass"
    scene.render.filepath = os.path.join(args.out, tag, "combined.png")
    bpy.ops.render.render(write_still=False)


if args.only in ("", "wide"):
    render("wide")
if args.only in ("", "close"):
    render("close", CLOSE_ZOOM, (cx, cy))
print("DONE")
