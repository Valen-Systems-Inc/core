import { TAU } from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
export const RuntimeMath = {
  clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  },

  smoothstep(edge0, edge1, value) {
    const t = RuntimeMath.clamp((value - edge0) / Math.max(0.00001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  easeOutCubic(t) {
    const p = 1 - RuntimeMath.clamp(t);
    return 1 - p * p * p;
  },

  easeInOutCubic(t) {
    const p = RuntimeMath.clamp(t);
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  },

  lerpVec3(out, a, b, t) {
    out[0] = RuntimeMath.lerp(a[0], b[0], t);
    out[1] = RuntimeMath.lerp(a[1], b[1], t);
    out[2] = RuntimeMath.lerp(a[2], b[2], t);
    return out;
  },

  lerpAngle(a, b, t) {
    const delta = ((((b - a) + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    return a + delta * t;
  },

  lerpEuler(out, a, b, t) {
    out[0] = RuntimeMath.lerpAngle(a[0], b[0], t);
    out[1] = RuntimeMath.lerpAngle(a[1], b[1], t);
    out[2] = RuntimeMath.lerpAngle(a[2], b[2], t);
    return out;
  },

  mixVec3(a, b, t) {
    return [
      RuntimeMath.lerp(a[0], b[0], t),
      RuntimeMath.lerp(a[1], b[1], t),
      RuntimeMath.lerp(a[2], b[2], t)
    ];
  },

  mixEuler(a, b, t) {
    return [
      RuntimeMath.lerpAngle(a[0], b[0], t),
      RuntimeMath.lerpAngle(a[1], b[1], t),
      RuntimeMath.lerpAngle(a[2], b[2], t)
    ];
  },

  perspective(out, fov, aspect, near = 0.1, far = 80) {
    const f = 1 / Math.tan((fov * Math.PI) / 360);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  lookAt(out, eye, center, up = [0, 1, 0]) {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },

  compose(out, position, rotation, scale) {
    const sx = Math.sin(rotation[0] * 0.5);
    const cx = Math.cos(rotation[0] * 0.5);
    const sy = Math.sin(rotation[1] * 0.5);
    const cy = Math.cos(rotation[1] * 0.5);
    const sz = Math.sin(rotation[2] * 0.5);
    const cz = Math.cos(rotation[2] * 0.5);
    const x = sx * cy * cz + cx * sy * sz;
    const y = cx * sy * cz - sx * cy * sz;
    const z = cx * cy * sz + sx * sy * cz;
    const w = cx * cy * cz - sx * sy * sz;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    out[0] = (1 - (yy + zz)) * scale[0];
    out[1] = (xy + wz) * scale[0];
    out[2] = (xz - wy) * scale[0];
    out[3] = 0;
    out[4] = (xy - wz) * scale[1];
    out[5] = (1 - (xx + zz)) * scale[1];
    out[6] = (yz + wx) * scale[1];
    out[7] = 0;
    out[8] = (xz + wy) * scale[2];
    out[9] = (yz - wx) * scale[2];
    out[10] = (1 - (xx + yy)) * scale[2];
    out[11] = 0;
    out[12] = position[0];
    out[13] = position[1];
    out[14] = position[2];
    out[15] = 1;
    return out;
  },

  projectPoint(matrix, point) {
    const x = point[0], y = point[1], z = point[2];
    const tx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const ty = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const tz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    const tw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    if (Math.abs(tw) < 0.00001) return null;
    return { x: tx / tw, y: ty / tw, z: tz / tw };
  }
};
