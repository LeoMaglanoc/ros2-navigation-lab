from glob import glob
from setuptools import setup
setup(
    name='navigation_lab', version='0.1.0', packages=['navigation_lab'],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/navigation_lab']),
        ('share/navigation_lab', ['package.xml']),
        ('share/navigation_lab/launch', glob('launch/*.launch.py')),
        ('share/navigation_lab/lib', glob('lib/*.so')),
    ],
    install_requires=['setuptools'], zip_safe=True,
    maintainer='Leonardo Maglanoc', maintainer_email='leo.maglanoc@gmail.com',
    description='ROS 2 adapter for a shared Rust navigation engine', license='MIT',
    entry_points={'console_scripts': ['navigation_server = navigation_lab.server:main']},
)
