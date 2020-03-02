let mousex = 0;
let scale = 0;
let posX = 0;
let posY = 6500;

let beforeTime = Date.now();

let gl = null;
let glCanvas = null;

// Aspect ratio and coordinate system
// details

let aspectRatio;
let currentRotation = [0, 1];
let currentScale = [1.0, 1.0];

// Vertex information

let vertexArray;
let vertexBuffer;
let vertexNumComponents;
let vertexCount;

let sGraphData;

// Rendering data shared with the
// scalers.

let uGlobalColor;
let uRotationVector;
let aVertexPosition;


// Animation timing

let previousTime = 0.0;
let degreesPerSecond = 90.0;
window.addEventListener("load", startup, false);


let numPoints = 1 << 14;
let numChannels = 1 << 6;
let padding = 1;
let rawdata = new ArrayBuffer(numPoints * numChannels);
let data = new Uint8Array(rawdata);

let uniforms = {};

let colors = [];
for (let i = 0; i < numChannels; ++i) {
    colors.push([Math.random(), Math.random(), Math.random(), 1.0]);
}

function startup() {
    glCanvas = document.getElementById("glcanvas");
    gl = glCanvas.getContext("webgl");

    const shaderSet = [
        {
            type: gl.VERTEX_SHADER,
            id: "vertex-shader"
        },
        {
            type: gl.FRAGMENT_SHADER,
            id: "fragment-shader"
        }
    ];

    shaderProgram = buildShaderProgram(shaderSet);

    aspectRatio = glCanvas.width / glCanvas.height;
    currentScale = [1.0, aspectRatio];

    vertexArray = new Float32Array([
        0.0, 1.0, 1.0, 1.0, 1.0, 0.0,
        0.0, 1.0, 1.0, 0.0, 0.0, 0.0
    ]);

    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

    vertexNumComponents = 2;
    vertexCount = vertexArray.length / vertexNumComponents;

    currentAngle = 0.0;
    rotationRate = 6;

    
    //sGraphData = gl.createTexture();
    sGraphData = createGraphTexture();

    texlocation = gl.getUniformLocation(shaderProgram, 'sGraphData');
    uGlobalColor = gl.getUniformLocation(shaderProgram, "uGlobalColor");
    uheight = gl.getUniformLocation(shaderProgram, "height");
    uheight2 = gl.getUniformLocation(shaderProgram, "height2");
    uChannel = gl.getUniformLocation(shaderProgram, "channel");
    uNumPoints = gl.getUniformLocation(shaderProgram, "numPoints");
    uWidth= gl.getUniformLocation(shaderProgram, "width");
    uDataOffset = gl.getUniformLocation(shaderProgram, "dataOffset");
    uMat = gl.getUniformLocation(shaderProgram, "uMat");


    // pre-render all data
    render(data, 0, numPoints, numChannels, posY * 0.01);

    animateScene();
}


function buildShaderProgram(shaderInfo) {
    let program = gl.createProgram();

    shaderInfo.forEach(function (desc) {
        let shader = compileShader(desc.id, desc.type);

        if (shader) {
            gl.attachShader(program, shader);
        }
    });

    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log("Error linking shader program:");
        console.log(gl.getProgramInfoLog(program));
    }

    return program;
}

function compileShader(id, type) {
    let code = document.getElementById(id).firstChild.nodeValue;
    let shader = gl.createShader(type);

    gl.shaderSource(shader, code);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log(`Error compiling ${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader:`);
        console.log(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function mult3x3(a, b) {
    return [
        a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
        a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
        a[0]*b[2] + a[1]*b[5] + a[2]*b[8],

        a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
        a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
        a[3]*b[2] + a[4]*b[5] + a[5]*b[8],

        a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
        a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
        a[6]*b[2] + a[7]*b[5] + a[8]*b[8],
    ]
}

function matScale(x, y) {
    return [
        x, 0.0, 0.0,
        0.0, y, 0.0,
        0.0, 0.0, 1.0
    ];
}

function matTranslate(x, y) {
    return [
        1.0, 0.0, x,
        0.0, 1.0, y,
        0.0, 0.0, 1.0
    ];
}

function createGraphTexture() {
    let texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D , gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D , gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texture;
}

function fillBoundGraphTexture(data, width, height) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, width, height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, data);
}

function drawGraph(x, y, width, height, texture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture)

    aVertexPosition =
        gl.getAttribLocation(shaderProgram, "aVertexPosition");
    gl.enableVertexAttribArray(aVertexPosition);
    gl.vertexAttribPointer(aVertexPosition, vertexNumComponents,
        gl.FLOAT, false, 0, 0);

    let view = [
        1.0/window.innerWidth* 2.0, 0.0, -1.0,
        0.0, 1.0/window.innerHeight * 2.0, -1.0,
        0.0, 0.0, 1.0
    ];
    let model = [
        width, 0.0, x,
        0.0, height, y,
        0.0, 0.0, 1.0
    ];
    let mat = mult3x3(view, model);
    gl.uniformMatrix3fv(uMat, false, mat);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

function signalBurst(t, period) {
    let bursting = Math.floor(t) % 4 == 0;
    return bursting * Math.round((Math.sin(t * period) + 1.0) / 2);
}

function render(data, start, width, num_channels, zoom) {
    // 0 1 2;
    let byteWidth = Math.min(data.length, width)
    for (let channel = 0; channel < num_channels; ++channel) {
    let last = 0;
        for (let i = 0; i < byteWidth; ++i) {
            let starttime = start;// + i;
            let time = starttime + i/zoom;
            //let v = Math.round((Math.sin(channel + start + i / zoom) + 1.0) / 2);
            let v = signalBurst((starttime + i) / 40, 1);
            let bursting = Math.floor(time) % 4 == 0 ? 1 : 0;
            v = bursting * Math.round((Math.sin(time * 22) + 1.0) / 2);

            if (i > 0 && v != last) {
                last = v;
                v = 0.5;
            }

            //data[i] = v * 127.5;;
            data[(channel * width) + i] = v * 255;
        }
    }
}

function animateScene() {
    let height = window.innerHeight;
    let width = window.innerWidth;

    let canvas = document.getElementById("glcanvas");
    canvas.width = width;
    canvas.height = height;

    let now = Date.now();
    let dt = now - beforeTime;
    beforeTime = now;

    posX += dt * 0.005;
    //render(data, posX , width, num_channels, posY * 0.01);

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);

    performance.mark("pre-clear");
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    performance.mark("post-clear");
    performance.measure("clear", "pre-clear", "post-clear");

    gl.useProgram(shaderProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sGraphData)

    fillBoundGraphTexture(data, numPoints, numChannels);
    gl.uniform1i(texlocation, 0);

    graphHeight = (height + padding) / numChannels;
    gl.uniform1i(uheight, graphHeight);
    gl.uniform1i(uheight2, graphHeight);
    gl.uniform1i(uWidth, width);
    gl.uniform1i(uNumPoints, numPoints);

    for (let i = 0; i < numChannels; ++i) {
        //let t = Math.sin(Date.now() / 1000  + i/10);
        gl.uniform1f(uChannel, i / (numChannels-1));
        gl.uniform4fv(uGlobalColor, colors[i % colors.length]);
        gl.uniform1f(uDataOffset, posX/100);
        drawGraph(0, window.innerHeight - ((i + 1) * (graphHeight + padding)), width, graphHeight, sGraphData);
    }

    window.requestAnimationFrame(function (currentTime) {
        let deltaAngle = ((currentTime - previousTime) / 1000.0)
            * degreesPerSecond;

        currentAngle = (currentAngle + deltaAngle) % 360;

        previousTime = currentTime;
        animateScene();
    });
}
document.onmousemove = function(ev) {
    mousex = event.clientX;
}
window.onwheel = function (e) {
  //e.preventDefault();

  if (e.ctrlKey) {
    // Your zoom/scale factor
    scale -= e.deltaY * 0.01;
  } else {
    // Your trackpad X and Y positions
    posX -= e.deltaX * 0.5;
    posY -= e.deltaY * 0.5;
  }
  if (e.deltaX != 0)  {

  } else {

  }

};