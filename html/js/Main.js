/// <reference path="ts-libs/soundjs/soundjs.d.ts" />
/// <reference path="ts-libs/threejs/three.d.ts" />
/// <reference path="ts-libs/threejs/three-trackballcontrols.d.ts" />
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
            /* サウンドID */
            this.SOUND_ID = "sound";
            /* Boxの間隔 */
            this.BOX_INTERVAL = 100;
            /* Color */
            this.START_COLOR = 0x2DADAC;
            this.END_COLOR = 0xFF337A;
            /* フーリエ変換を行う分割数。2の乗数でなくてはならない */
            this.FFTSIZE = 64;
            /* Boxを描画するカウント */
            this.drawCount = -1;
            // iOS
            if (/(iPad|iPhone|iPod)/g.test(navigator.userAgent)) {
                this.soundPass = "sound/sound.m4a";
            }
            else {
                this.soundPass = "sound/sound.ogg";
            }
            // 3D空間の作成
            this.scene = new THREE.Scene();
            // カメラの作成
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
            this.camera.position.set(2500, 5000, -2500);
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
            // TrackballControls
            this.controls = new THREE.TrackballControls(this.camera);
            this.controls.target.set(0, 500, 0);
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
            this.controls.update();
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