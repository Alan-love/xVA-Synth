import torch
import traceback

class ModelsManager(object):

    def __init__(self, logger, PROD, device):
        super(ModelsManager, self).__init__()

        self.models = {}
        self.logger = logger
        self.PROD = PROD
        self.device = device

    def init_model (self, model_key):
        try:
            if model_key in self.models.keys() and self.models[model_key].isReady:
                pass
            self.logger.info(f'ModelsManager: Initializing model: {model_key}')

            if model_key=="xVARep":
                from python.xVARep.model import xVARep
                self.models[model_key] = xVARep(self.logger, self.PROD, self.device)
                self.load_model(model_key, ("./resources/app" if self.PROD else ".")+"/python/xVARep/xVARep.pt")

            elif model_key=="hifigan":
                from python.hifigan.model import HiFi_GAN
                self.models[model_key] = HiFi_GAN(self.logger, self.PROD, self.device)

        except:
            self.logger.info(traceback.format_exc())

    def load_model (self, model_key, ckpt_path):

        if model_key not in self.models.keys():
            self.init_model(model_key)

        if self.models[model_key].ckpt_path != ckpt_path:
            self.logger.info(f'ModelsManager: Loading model checkpoint: {model_key}, {ckpt_path}')
            ckpt = torch.load(ckpt_path)
            self.models[model_key].load_state_dict(ckpt_path, ckpt)

    def set_device (self, device):
        self.logger.info(f'ModelsManager: Changing device to: {device}')
        for model_key in list(self.models.keys()):
            self.models[model_key].model = self.models[model_key].model.to(device)
