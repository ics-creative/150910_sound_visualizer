/// <reference path="ts-libs/soundjs/soundjs.d.ts" />
/// <reference path="ts-libs/threejs/three.d.ts" />

module demo {

    /**
     * SoundJSでサウンドビジュアライズするクラスです。
     */
    export class SoundVisualizer {
        /** サウンドID */
        private SOUND_ID:string = "sound";

        /** Boxの間隔 */
        private BOX_INTERVAL:number = 100;

        /** Color */
        private START_COLOR:number = 0x2DADAC;
        private END_COLOR:number = 0xFF337A;

        /** フーリエ変換を行う分割数。2の乗数でなくてはならない */
        private FFTSIZE:number = 64;

        /** サウンドのパス */
        private soundPass:string;

        /** アナライザー */
        private analyserNode;

        /** それぞれの周波数の振幅を格納する配列 */
        private freqByteDataArray:Array<Uint8Array>;

        /** シーン */
        private scene:THREE.Scene;

        /** カメラ */
        private camera:THREE.PerspectiveCamera;

        /** レンダラー */
        private renderer:THREE.WebGLRenderer;

        /** 地面 */
        private grid:THREE.GridHelper;

        /** WebAudioPluginを取得 */
        private plugin:createjs.WebAudioPlugin;

        /** Boxを描画するカウント */
        private drawCount:number = -1;

        /** はじめに描画したBox */
        private firstBox:Box;

        /** 回転角度 */
        private rot:number = 90;

        /** マウスを押した状態かどうかを判別するフラグ */
        private isMouseDown:boolean = false;

        /** ドラッグ量の差分を取るためにX座標を保持する */
        private oldX:number = 0;

        /** 目標となる回転角度 */
        private targetRot:number = 90;

        public constructor() {
            // iOS
            if(/(iPad|iPhone|iPod)/g.test( navigator.userAgent )) {
                this.soundPass = "sound/sound.m4a";
            }
            // Other
            else {
                this.soundPass = "sound/sound.ogg";
            }

            // touch
            if(createjs.Touch.isSupported()) {
                document.addEventListener("touchstart", (event) => this.touchstartHandler(event));
                document.addEventListener("touchmove", (event) => this.touchmoveHandler(event));
                document.addEventListener("touchend", (event) => this.touchendHandler(event));
            }
            // mouse
            else {
                document.addEventListener("mousedown", (event) => this.mousedownHandler(event));
                document.addEventListener("mousemove", (event) => this.mousemoveHandler(event));
                document.addEventListener("mouseup", (event) => this.mouseupHandler(event));
            }

            // 3D空間の作成
            this.scene = new THREE.Scene();

            // カメラの作成
            this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
            this.camera.position.set(0, 6000, 0);

            // レンダラーの作成
            this.renderer = new THREE.WebGLRenderer({antialias: true});
            this.renderer.setClearColor(0x000000);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);

            // 地面
            this.grid = new THREE.GridHelper(2000, this.BOX_INTERVAL);
            this.grid.setColors(0x333333, 0x333333);
            this.grid.position.y = -500;
            this.scene.add(this.grid);

            window.addEventListener("resize", () => this.resizeHandler);
            this.resizeHandler();

            // 一つ前のループ時のBox
            var prevBox:Box;

            // freqByteDataを保持しておく配列
            this.freqByteDataArray = [];

            // Boxの描画
            for(var i:number = 0; i < this.FFTSIZE / 2; i++) {
                var array:Uint8Array = new Uint8Array(this.FFTSIZE / 2);

                for(var j:number = 0; j < this.FFTSIZE / 2; j++) {
                    var box = this.createBox(j);

                    if(!this.firstBox) this.firstBox = box;
                    else prevBox.next = box;

                    var center:number = this.BOX_INTERVAL * this.FFTSIZE / 4;
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
        public soundPlay() {
            this.startPlayback();
        }

        /**
         * サウンドの音量をONにします
         */
        public soundOn() {
            if(!this.plugin) return;
            this.plugin.setVolume(1);
        }

        /**
         * サウンドの音量をOFFにします
         */
        public soundOff() {
            if(!this.plugin) return;
            this.plugin.setVolume(0);
        }

        /**
         * サウンドを読み込みます
         */
        private load() {
            // プラグインが初期化されているかどうか
            if (!createjs.Sound.initializeDefaultPlugins()) return;

            createjs.Sound.alternateExtensions = ["mp3"];
            createjs.FlashAudioPlugin.swfPath = "swf/";
            createjs.Sound.on("fileload", () => this.fileloadHandler());
            // サウンドの登録 読み込み
            createjs.Sound.registerSound({id: this.SOUND_ID, src: this.soundPass});
        }

        /**
         * サウンドファイルの読み込みが完了しました。
         */
        private fileloadHandler() {
            var loading:HTMLElement = document.getElementById("loading");
            loading.style.display = "none";

            this.analyser();
        }

        /**
         * アナライザーの設定を行います
         */
        private analyser() {
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

            var playBtn:HTMLElement = document.getElementById("play_btn");
            playBtn.style.display = "block";
        }

        /**
         * サウンドを再生します
         */
        private startPlayback() {
            // サウンドをループ再生
            createjs.Sound.play(this.SOUND_ID, {loop: -1});
        }

        /**
         * 繰り返し処理です
         */
        private loop() {
            requestAnimationFrame(() => this.loop());

            this.draw();

            // 画面のアップデート
            this.render();
        }

        /**
         * エンターフレームイベントです
         */
        private render() {
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
        }

        /**
         * 描画します
         */
        private draw() {
            this.drawCount++;
            if (this.drawCount == 2) this.drawCount = 0;

            if (this.drawCount == 0) {
                if(this.analyserNode) {
                    // 波形データを格納する配列の生成
                    var freqByteData:Uint8Array = new Uint8Array(this.FFTSIZE / 2);

                    // それぞれの周波数の振幅を取得
                    this.analyserNode.getByteFrequencyData(freqByteData);

                    this.freqByteDataArray.push(freqByteData);
                    // 古いデータを一つ削除
                    if(this.freqByteDataArray.length > this.FFTSIZE / 2) this.freqByteDataArray.shift();

                    var box:Box = this.firstBox;
                    // Boxの描画の更新
                    for(var i:number = 0; i < this.FFTSIZE / 2; i++) {
                        for(var j:number = 0; j < this.FFTSIZE / 2; j++) {
                            var freqSum = this.freqByteDataArray[i][j];
                            if(!freqSum) freqSum = 0;
                            else freqSum /= 256;
                            box.position.y = 1500 + freqSum * 4000 - 2000;
                            box = box.next;
                        }
                    }
                }
            }
        }

        /**
         * 立方体を生成します
         * @param index
         * @returns {THREE.Mesh}
         */
        private createBox(index) {
            // カラーコード生成
            var colorCode:number = this.START_COLOR + (this.END_COLOR - this.START_COLOR) / (this.FFTSIZE / 2) * index;

            // 立方体
            var geometry:THREE.BoxGeometry = new THREE.BoxGeometry(40, 40, 40);
            var material:THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: colorCode});

            return new Box(geometry, material);
        }

        /**
         * 画面のリサイズ処理です
         */
        private resizeHandler() {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }

        /**
         * mousedown Handler
         * @param event
         */
        private mousedownHandler(event) {
            this.isMouseDown = true;
            this.oldX = event.pageX;
        }

        /**
         * mousemove Handler
         * @param event
         */
        private mousemoveHandler(event) {
            if(this.isMouseDown) {
                var dy = event.pageX - this.oldX;
                this.targetRot -= dy * 0.25;
                this.oldX = event.pageX;
            }
        }

        /**
         * mouseup Handler
         * @param event
         */
        private mouseupHandler(event) {
            this.isMouseDown = false;
        }

        /**
         * touchstart Handler
         * @param event
         */
        private touchstartHandler(event) {
            this.isMouseDown = true;
            this.oldX = event.touches[0].pageX;
        }

        /**
         * touchmove Handler
         * @param event
         */
        private touchmoveHandler(event) {
            if(this.isMouseDown) {
                var dy = event.touches[0].pageX - this.oldX;
                this.targetRot -= dy * 0.25;
                this.oldX = event.touches[0].pageX;
            }
        }

        /**
         * touchend Handler
         * @param event
         */
        private touchendHandler(event) {
            this.isMouseDown = false;
        }
    }

    /**
     * Box Class
     */
    class Box extends THREE.Mesh {
        public next:Box;

        public constructor(geometry, material) {
            super(geometry, material);
        }
    }
}

window.addEventListener("load", ()=> {
    var soundVisualizer = new demo.SoundVisualizer();

    var soundBtn:HTMLElement = document.getElementById("sound_btn");
    soundBtn.addEventListener("click", function() {
        if(soundBtn.className == "on") {
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

    var playBtn:HTMLElement = document.getElementById("play_btn");
    playBtn.addEventListener("click", function() {
        playBtn.style.display = "none";
        soundVisualizer.soundPlay();
    });
});