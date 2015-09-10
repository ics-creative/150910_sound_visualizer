/// <reference path="ts-libs/soundjs/soundjs.d.ts" />
/// <reference path="ts-libs/threejs/three.d.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var demo;
(function (demo) {
    /**
     * SoundJSでサウンドビジュアライズするクラスです。
     */
    var SoundVisualizer = (function () {
        function SoundVisualizer() {
            var _this = this;
            /** サウンドID */
            this.SOUND_ID = "sound";
            /** Boxの間隔 */
            this.BOX_INTERVAL = 100;
            /** Color */
            this.START_COLOR = 0x2DADAC;
            this.END_COLOR = 0xFF337A;
            /** フーリエ変換を行う分割数。2の乗数でなくてはならない */
            this.FFTSIZE = 64;
            /** Boxを描画するカウント */
            this.drawCount = -1;
            /** 回転角度 */
            this.rot = 90;
            /** マウスを押した状態かどうかを判別するフラグ */
            this.isMouseDown = false;
            /** ドラッグ量の差分を取るためにX座標を保持する */
            this.oldX = 0;
            /** 目標となる回転角度 */
            this.targetRot = 90;
            // iOS
            if (/(iPad|iPhone|iPod)/g.test(navigator.userAgent)) {
                this.soundPass = "sound/sound.m4a";
            }
            else {
                this.soundPass = "sound/sound.ogg";
            }
            // touch
            if (createjs.Touch.isSupported()) {
                document.addEventListener("touchstart", function (event) { return _this.touchstartHandler(event); });
                document.addEventListener("touchmove", function (event) { return _this.touchmoveHandler(event); });
                document.addEventListener("touchend", function (event) { return _this.touchendHandler(event); });
            }
            else {
                document.addEventListener("mousedown", function (event) { return _this.mousedownHandler(event); });
                document.addEventListener("mousemove", function (event) { return _this.mousemoveHandler(event); });
                document.addEventListener("mouseup", function (event) { return _this.mouseupHandler(event); });
            }
            // 3D空間の作成
            this.scene = new THREE.Scene();
            // カメラの作成
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
            this.camera.position.set(0, 6000, 0);
            // レンダラーの作成
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setClearColor(0x000000);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);
            // 地面
            this.grid = new THREE.GridHelper(2000, this.BOX_INTERVAL);
            this.grid.setColors(0x333333, 0x333333);
            this.grid.position.y = -500;
            this.scene.add(this.grid);
            window.addEventListener("resize", function () { return _this.resizeHandler; });
            this.resizeHandler();
            // 一つ前のループ時のBox
            var prevBox;
            // freqByteDataを保持しておく配列
            this.freqByteDataArray = [];
            for (var i = 0; i < this.FFTSIZE / 2; i++) {
                var array = new Uint8Array(this.FFTSIZE / 2);
                for (var j = 0; j < this.FFTSIZE / 2; j++) {
                    var box = this.createBox(j);
                    if (!this.firstBox)
                        this.firstBox = box;
                    else
                        prevBox.next = box;
                    var center = this.BOX_INTERVAL * this.FFTSIZE / 4;
                    box.position.set(this.BOX_INTERVAL * j - center, -500, this.BOX_INTERVAL * i - center);
                    //this.boxes.push(box);
                    this.scene.add(box);
                    prevBox = box;
                    array[j] = 0;
                }
                this.freqByteDataArray.push(array);
            }
            this.loop();
            // サウンドを読み込みます
            this.load();
        }
        /**
         * サウンドを再生します
         */
        SoundVisualizer.prototype.soundPlay = function () {
            this.startPlayback();
        };
        /**
         * サウンドの音量をONにします
         */
        SoundVisualizer.prototype.soundOn = function () {
            if (!this.plugin)
                return;
            this.plugin.setVolume(1);
        };
        /**
         * サウンドの音量をOFFにします
         */
        SoundVisualizer.prototype.soundOff = function () {
            if (!this.plugin)
                return;
            this.plugin.setVolume(0);
        };
        /**
         * サウンドを読み込みます
         */
        SoundVisualizer.prototype.load = function () {
            var _this = this;
            // プラグインが初期化されているかどうか
            if (!createjs.Sound.initializeDefaultPlugins())
                return;
            createjs.Sound.alternateExtensions = ["mp3"];
            createjs.FlashAudioPlugin.swfPath = "swf/";
            createjs.Sound.on("fileload", function () { return _this.fileloadHandler(); });
            // サウンドの登録 読み込み
            createjs.Sound.registerSound({ id: this.SOUND_ID, src: this.soundPass });
        };
        /**
         * サウンドファイルの読み込みが完了しました。
         */
        SoundVisualizer.prototype.fileloadHandler = function () {
            var loading = document.getElementById("loading");
            loading.style.display = "none";
            this.analyser();
        };
        /**
         * アナライザーの設定を行います
         */
        SoundVisualizer.prototype.analyser = function () {
            // WebAudioPluginを取得
            this.plugin = new createjs.WebAudioPlugin();
            var context = this.plugin.context;
            // アナライザーを生成
            this.analyserNode = context.createAnalyser();
            // フーリエ変換を行う分割数。2の乗数でなくてはならない
            this.analyserNode.fftSize = this.FFTSIZE;
            // 0～1の範囲でデータの動きの速さ 0だともっとも速く、1に近づくほど遅くなる
            this.analyserNode.smoothingTimeConstant = 0.85;
            // オーディオの出力先を設定
            this.analyserNode.connect(context.destination);
            // 音のゆがみを補正するコンプレッサー
            var dynamicsNode = this.plugin.dynamicsCompressorNode;
            dynamicsNode.disconnect();
            dynamicsNode.connect(this.analyserNode);
            var playBtn = document.getElementById("play_btn");
            playBtn.style.display = "block";
        };
        /**
         * サウンドを再生します
         */
        SoundVisualizer.prototype.startPlayback = function () {
            // サウンドをループ再生
            createjs.Sound.play(this.SOUND_ID, { loop: -1 });
        };
        /**
         * 繰り返し処理です
         */
        SoundVisualizer.prototype.loop = function () {
            var _this = this;
            requestAnimationFrame(function () { return _this.loop(); });
            this.draw();
            // 画面のアップデート
            this.render();
        };
        /**
         * エンターフレームイベントです
         */
        SoundVisualizer.prototype.render = function () {
            // イージングの公式を用いて滑らかにする
            // 値 += (目標値 - 現在の値) * 減速値
            this.rot += (this.targetRot - this.rot) * 0.05;
            //console.log(this.targetRot);
            // 角度に応じてカメラの位置を設定
            this.camera.position.x = 5000 * Math.sin(this.rot * Math.PI / 180);
            this.camera.position.z = 5000 * Math.cos(this.rot * Math.PI / 180);
            // 原点方向を見つめる
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));
            // Three.js のレンダリング
            this.renderer.render(this.scene, this.camera);
        };
        /**
         * 描画します
         */
        SoundVisualizer.prototype.draw = function () {
            this.drawCount++;
            if (this.drawCount == 2)
                this.drawCount = 0;
            if (this.drawCount == 0) {
                if (this.analyserNode) {
                    // 波形データを格納する配列の生成
                    var freqByteData = new Uint8Array(this.FFTSIZE / 2);
                    // それぞれの周波数の振幅を取得
                    this.analyserNode.getByteFrequencyData(freqByteData);
                    this.freqByteDataArray.push(freqByteData);
                    // 古いデータを一つ削除
                    if (this.freqByteDataArray.length > this.FFTSIZE / 2)
                        this.freqByteDataArray.shift();
                    var box = this.firstBox;
                    for (var i = 0; i < this.FFTSIZE / 2; i++) {
                        for (var j = 0; j < this.FFTSIZE / 2; j++) {
                            var freqSum = this.freqByteDataArray[i][j];
                            if (!freqSum)
                                freqSum = 0;
                            else
                                freqSum /= 256;
                            box.position.y = 1500 + freqSum * 4000 - 2000;
                            box = box.next;
                        }
                    }
                }
            }
        };
        /**
         * 立方体を生成します
         * @param index
         * @returns {THREE.Mesh}
         */
        SoundVisualizer.prototype.createBox = function (index) {
            // カラーコード生成
            var colorCode = this.START_COLOR + (this.END_COLOR - this.START_COLOR) / (this.FFTSIZE / 2) * index;
            // 立方体
            var geometry = new THREE.BoxGeometry(40, 40, 40);
            var material = new THREE.LineBasicMaterial({ color: colorCode });
            return new Box(geometry, material);
        };
        /**
         * 画面のリサイズ処理です
         */
        SoundVisualizer.prototype.resizeHandler = function () {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        };
        /**
         * mousedown Handler
         * @param event
         */
        SoundVisualizer.prototype.mousedownHandler = function (event) {
            this.isMouseDown = true;
            this.oldX = event.pageX;
        };
        /**
         * mousemove Handler
         * @param event
         */
        SoundVisualizer.prototype.mousemoveHandler = function (event) {
            if (this.isMouseDown) {
                var dy = event.pageX - this.oldX;
                this.targetRot -= dy * 0.25;
                this.oldX = event.pageX;
            }
        };
        /**
         * mouseup Handler
         * @param event
         */
        SoundVisualizer.prototype.mouseupHandler = function (event) {
            this.isMouseDown = false;
        };
        /**
         * touchstart Handler
         * @param event
         */
        SoundVisualizer.prototype.touchstartHandler = function (event) {
            this.isMouseDown = true;
            this.oldX = event.touches[0].pageX;
        };
        /**
         * touchmove Handler
         * @param event
         */
        SoundVisualizer.prototype.touchmoveHandler = function (event) {
            if (this.isMouseDown) {
                var dy = event.touches[0].pageX - this.oldX;
                this.targetRot -= dy * 0.25;
                this.oldX = event.touches[0].pageX;
            }
        };
        /**
         * touchend Handler
         * @param event
         */
        SoundVisualizer.prototype.touchendHandler = function (event) {
            this.isMouseDown = false;
        };
        return SoundVisualizer;
    })();
    demo.SoundVisualizer = SoundVisualizer;
    /**
     * Box Class
     */
    var Box = (function (_super) {
        __extends(Box, _super);
        function Box(geometry, material) {
            _super.call(this, geometry, material);
        }
        return Box;
    })(THREE.Mesh);
})(demo || (demo = {}));
window.addEventListener("load", function () {
    var soundVisualizer = new demo.SoundVisualizer();
    var soundBtn = document.getElementById("sound_btn");
    soundBtn.addEventListener("click", function () {
        if (soundBtn.className == "on") {
            soundBtn.innerHTML = "SOUND : ON";
            soundBtn.className = "off";
            soundVisualizer.soundOff();
        }
        else {
            soundBtn.innerHTML = "SOUND : OFF";
            soundBtn.className = "on";
            soundVisualizer.soundOn();
        }
    });
    var playBtn = document.getElementById("play_btn");
    playBtn.addEventListener("click", function () {
        playBtn.style.display = "none";
        soundVisualizer.soundPlay();
    });
});
//# sourceMappingURL=Main.js.map